"""
executor.py — Async execution engine for the LLM Red-Teaming Engine.

Bridges the Attacker (async generator) and Target RAG (async function).
Dispatches attacks as tasks the moment they are yielded — no need to buffer
all prompts before firing starts. An asyncio.Semaphore caps how many
target queries run simultaneously, keeping free-tier rate limits intact.

Every (attack → response) pair is linked in the execution_results table,
giving the Evaluator a single join to pull a full campaign picture.
"""

import asyncio
import os
import sqlite3
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable

from dotenv import load_dotenv

EventCallback = Callable[[str, dict], Awaitable[None]]

from attacker import AttackCategory, generate_attacks, init_attack_db
from target_rag import init_db, query_target_rag

load_dotenv()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def init_exec_db(db_conn: sqlite3.Connection) -> None:
    """Add the execution_results table to an existing connection if absent."""
    db_conn.execute("""
        CREATE TABLE IF NOT EXISTS execution_results (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            attack_id        INTEGER NOT NULL,   -- FK → attack_prompts.id
            interaction_id   INTEGER,            -- FK → rag_interactions.id (NULL on total failure)
            fired_at         TEXT    NOT NULL,   -- ISO-8601 UTC, when the request was dispatched
            completed_at     TEXT    NOT NULL,   -- ISO-8601 UTC, when the response was received
            wall_latency_ms  REAL    NOT NULL,   -- end-to-end latency measured by the executor
            task_index       INTEGER NOT NULL,   -- sequential ordinal across the campaign
            status           TEXT    NOT NULL    -- "success" | "error"
        )
    """)
    db_conn.commit()


def _log_result(
    db_conn: sqlite3.Connection,
    *,
    attack_id: int,
    interaction_id: int | None,
    fired_at: str,
    completed_at: str,
    wall_latency_ms: float,
    task_index: int,
    status: str,
) -> int:
    cursor = db_conn.execute(
        """
        INSERT INTO execution_results
            (attack_id, interaction_id, fired_at, completed_at,
             wall_latency_ms, task_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            attack_id, interaction_id, fired_at, completed_at,
            wall_latency_ms, task_index, status,
        ),
    )
    db_conn.commit()
    return cursor.lastrowid

# ---------------------------------------------------------------------------
# Internal per-attack coroutine
# ---------------------------------------------------------------------------

async def _fire_one(
    attack: dict,
    task_index: int,
    semaphore: asyncio.Semaphore,
    db_conn: sqlite3.Connection,
    verbose: bool,
    completed_counter: list[int],   # single-element mutable counter
    total_tasks: int,
    on_event: EventCallback | None = None,
) -> dict:
    """
    Acquire a semaphore slot, fire the attack at the target, log the pair,
    and return a unified result dict consumed by run_campaign.
    """
    async with semaphore:
        fired_at = datetime.now(timezone.utc).isoformat()
        wall_start = time.monotonic()

        rag_result = await query_target_rag(attack["prompt"], db_conn)

        wall_latency_ms = (time.monotonic() - wall_start) * 1000
        completed_at = datetime.now(timezone.utc).isoformat()

        status = "error" if rag_result["error"] else "success"

        exec_id = _log_result(
            db_conn,
            attack_id=attack["attack_id"],
            interaction_id=rag_result["interaction_id"],
            fired_at=fired_at,
            completed_at=completed_at,
            wall_latency_ms=wall_latency_ms,
            task_index=task_index,
            status=status,
        )

        completed_counter[0] += 1

        if on_event:
            await on_event("attack_completed", {
                "task_index": task_index,
                "completed": completed_counter[0],
                "total": total_tasks,
                "category": attack["category"].value,
                "source": attack["source"],
                "prompt": attack["prompt"],
                "response_text": rag_result["response_text"],
                "status": status,
                "latency_ms": wall_latency_ms,
                "error": rag_result["error"],
            })

        if verbose:
            tag = f"[{attack['source'].upper():<13}]"
            cat = f"[{attack['category'].value}]"
            err = f" ERROR={rag_result['error']}" if rag_result["error"] else ""
            print(
                f"  [{completed_counter[0]:>3}/{total_tasks}] "
                f"task={task_index:<3} {tag} {cat:<28} "
                f"{wall_latency_ms:>7.0f} ms{err}"
            )

        return {
            "exec_id":          exec_id,
            "attack_id":        attack["attack_id"],
            "interaction_id":   rag_result["interaction_id"],
            "category":         attack["category"],
            "prompt":           attack["prompt"],
            "response_text":    rag_result["response_text"],
            "wall_latency_ms":  wall_latency_ms,
            "rag_latency_ms":   rag_result["latency_ms"],
            "prompt_tokens":    rag_result["prompt_tokens"],
            "completion_tokens": rag_result["completion_tokens"],
            "source":           attack["source"],
            "status":           status,
            "error":            rag_result["error"],
        }

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_campaign(
    db_conn: sqlite3.Connection,
    *,
    concurrency: int = 5,
    categories: list[AttackCategory] | None = None,
    attacks_per_category: int = 3,
    include_seeds: bool = True,
    verbose: bool = True,
    on_event: EventCallback | None = None,
) -> list[dict]:
    """
    Run a full red-team campaign and return a list of result dicts.

    Attacks are dispatched as tasks the moment the Attacker generator yields them,
    so LLM-generated prompts begin reaching the Target before generation completes.
    The asyncio.Semaphore(concurrency) cap prevents overwhelming free-tier quotas.

    Args:
        db_conn:               Open SQLite connection with all three tables initialised.
        concurrency:           Max simultaneous requests against the Target RAG.
        categories:            Attack categories to use (default: all 8).
        attacks_per_category:  LLM-generated prompts per category.
        include_seeds:         Whether to prepend hardcoded seed attacks.
        verbose:               Print a one-line status update per completed attack.

    Returns:
        List of unified result dicts, one per attack, in completion order.
    """
    semaphore = asyncio.Semaphore(concurrency)
    tasks: list[asyncio.Task] = []
    completed_counter = [0]     # mutable so the nested coroutine can update it
    task_index = 0

    campaign_start = time.monotonic()

    if verbose:
        print(
            f"\n{'─'*70}\n"
            f"  Campaign started  |  concurrency={concurrency}  "
            f"|  categories={len(categories) if categories else 8}\n"
            f"{'─'*70}"
        )

    # Collect task count first-pass estimate for the progress display.
    # We don't know the final total until the generator is exhausted, so we
    # use a sentinel value and update as we go.
    total_tasks_ref = [0]

    async def _collect_and_dispatch():
        nonlocal task_index
        attack_gen = generate_attacks(
            db_conn,
            categories=categories,
            attacks_per_category=attacks_per_category,
            include_seeds=include_seeds,
        )
        async for attack in attack_gen:
            task_index += 1
            total_tasks_ref[0] = task_index   # best-effort running total
            t = asyncio.create_task(
                _fire_one(
                    attack,
                    task_index,
                    semaphore,
                    db_conn,
                    verbose,
                    completed_counter,
                    total_tasks_ref[0],   # snapshot; completed_counter prints live
                    on_event,
                )
            )
            tasks.append(t)
            if on_event:
                await on_event("attack_dispatched", {
                    "task_index": task_index,
                    "category": attack["category"].value,
                    "source": attack["source"],
                })

    # Dispatch loop runs concurrently with already-created tasks
    await _collect_and_dispatch()

    # Await all remaining in-flight tasks
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    campaign_wall_s = time.monotonic() - campaign_start

    # Separate clean results from unexpected exceptions (shouldn't happen —
    # _fire_one handles its own errors — but be defensive)
    results: list[dict] = []
    for r in raw_results:
        if isinstance(r, Exception):
            print(f"  [UNEXPECTED TASK EXCEPTION] {r}")
        else:
            results.append(r)

    success = sum(1 for r in results if r["status"] == "success")
    errors  = sum(1 for r in results if r["status"] == "error")
    avg_lat = (
        sum(r["wall_latency_ms"] for r in results) / len(results)
        if results else 0
    )

    if on_event:
        await on_event("execution_complete", {
            "total": len(results),
            "success": success,
            "errors": errors,
            "avg_latency_ms": avg_lat,
            "wall_time_s": campaign_wall_s,
        })

    if verbose:
        print(
            f"\n{'─'*70}\n"
            f"  Campaign complete  |  total={len(results)}  success={success}  "
            f"error={errors}  avg_latency={avg_lat:.0f}ms  "
            f"wall_time={campaign_wall_s:.1f}s\n"
            f"{'─'*70}\n"
        )

    return results

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

async def _smoke_test():
    db_path = os.getenv("DB_PATH", "rag_interactions.db")
    conn = init_db(db_path)
    init_attack_db(conn)
    init_exec_db(conn)

    results = await run_campaign(
        conn,
        concurrency=3,
        categories=[AttackCategory.DIRECT_EXTRACTION, AttackCategory.ROLEPLAY_JAILBREAK],
        attacks_per_category=2,
        include_seeds=True,
        verbose=True,
    )

    print(f"Returned {len(results)} result dicts to caller.\n")
    print("Sample result keys:", list(results[0].keys()) if results else "[]")
    conn.close()


if __name__ == "__main__":
    asyncio.run(_smoke_test())
