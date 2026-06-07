"""
backend/runner.py — Campaign orchestrator for the web UI.

Wraps the existing async pipeline (attacker → executor → target → evaluator) and
emits structured events to an asyncio.Queue per campaign. The FastAPI SSE endpoint
consumes the queue and streams events to the browser.

In-memory state (campaigns dict) is fine for a POC; restart clears history.
All data still persists in rag_interactions.db for forensic querying.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import uuid4

# Allow running uvicorn from repo root with `uvicorn backend.app:app`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from attacker import AttackCategory, init_attack_db
from evaluator import (
    evaluate_campaign,
    export_csv,
    generate_report,
    init_eval_db,
)
from executor import init_exec_db, run_campaign
from target_rag import init_db


class CampaignStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"


DB_PATH = os.getenv("DB_PATH", "rag_interactions.db")
REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "reports"))
REPORTS_DIR.mkdir(exist_ok=True)

# campaign_id -> dict with config, status, event queue, summary, etc.
_campaigns: dict[str, dict[str, Any]] = {}


def list_campaigns() -> list[dict]:
    """Return lightweight metadata for every campaign (newest first)."""
    return sorted(
        [
            {
                "id": c["id"],
                "status": c["status"],
                "started_at": c["started_at"],
                "completed_at": c.get("completed_at"),
                "config": c["config"],
                "summary": c.get("summary"),
            }
            for c in _campaigns.values()
        ],
        key=lambda c: c["started_at"],
        reverse=True,
    )


def get_campaign(campaign_id: str) -> dict | None:
    c = _campaigns.get(campaign_id)
    if not c:
        return None
    return {
        "id": c["id"],
        "status": c["status"],
        "started_at": c["started_at"],
        "completed_at": c.get("completed_at"),
        "config": c["config"],
        "summary": c.get("summary"),
        "evaluations": c.get("evaluations", []),
        "error": c.get("error"),
    }


async def subscribe_events(campaign_id: str):
    """Async generator yielding event dicts for an existing campaign."""
    campaign = _campaigns.get(campaign_id)
    if not campaign:
        return

    queue: asyncio.Queue = campaign["queue"]

    # Replay buffered events so a late subscriber sees the full history
    for ev in list(campaign["event_log"]):
        yield ev

    if campaign["status"] in (CampaignStatus.COMPLETED, CampaignStatus.FAILED):
        return

    while True:
        ev = await queue.get()
        if ev is None:  # sentinel = campaign done
            break
        yield ev


def create_campaign(config: dict) -> str:
    """Kick off a campaign asynchronously and return its id."""
    campaign_id = str(uuid4())
    queue: asyncio.Queue = asyncio.Queue()

    _campaigns[campaign_id] = {
        "id": campaign_id,
        "status": CampaignStatus.PENDING,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "config": config,
        "queue": queue,
        "event_log": [],       # buffered events for late subscribers
        "summary": None,
        "evaluations": [],
        "error": None,
    }

    asyncio.create_task(_run_campaign(campaign_id))
    return campaign_id


async def _run_campaign(campaign_id: str) -> None:
    campaign = _campaigns[campaign_id]
    config = campaign["config"]
    queue: asyncio.Queue = campaign["queue"]

    async def emit(event_type: str, data: dict) -> None:
        ev = {
            "type": event_type,
            "data": data,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        campaign["event_log"].append(ev)
        await queue.put(ev)

    try:
        await emit("status", {"status": CampaignStatus.EXECUTING.value})
        campaign["status"] = CampaignStatus.EXECUTING

        # Each campaign gets its own connection (thread-safe, WAL mode already on)
        conn = init_db(DB_PATH)
        init_attack_db(conn)
        init_exec_db(conn)
        init_eval_db(conn)

        try:
            categories = [AttackCategory(c) for c in config["categories"]]

            results = await run_campaign(
                conn,
                concurrency=config["concurrency"],
                categories=categories,
                attacks_per_category=config["attacks_per_category"],
                include_seeds=config["include_seeds"],
                verbose=False,
                on_event=emit,
            )

            if not results:
                raise RuntimeError("Campaign produced zero results — check API keys/quotas.")

            await emit("status", {"status": CampaignStatus.EVALUATING.value})
            campaign["status"] = CampaignStatus.EVALUATING

            evaluations = await evaluate_campaign(
                results,
                conn,
                concurrency=config["eval_concurrency"],
                verbose=False,
                on_event=emit,
            )

            df = generate_report(evaluations)
            csv_path = REPORTS_DIR / f"{campaign_id}.csv"
            export_csv(df, str(csv_path))

            summary = _build_summary(evaluations)
            campaign["summary"] = summary
            campaign["evaluations"] = [_eval_for_api(e) for e in evaluations]
            campaign["status"] = CampaignStatus.COMPLETED
            campaign["completed_at"] = datetime.now(timezone.utc).isoformat()

            await emit("campaign_complete", {
                "summary": summary,
                "csv_path": str(csv_path),
                "evaluation_count": len(evaluations),
            })
        finally:
            conn.close()

    except Exception as exc:
        campaign["status"] = CampaignStatus.FAILED
        campaign["error"] = str(exc)
        campaign["completed_at"] = datetime.now(timezone.utc).isoformat()
        await emit("error", {"message": str(exc)})

    finally:
        await queue.put(None)  # terminate any live subscribers


def _eval_for_api(e: dict) -> dict:
    """Serialize an evaluation dict for JSON transport (strip enum, trim text)."""
    return {
        "eval_id": e["eval_id"],
        "attack_id": e["attack_id"],
        "category": e["category"].value if hasattr(e["category"], "value") else e["category"],
        "source": e.get("source"),
        "prompt": e["prompt"],
        "response_text": e.get("response_text"),
        "heuristic_score": e["heuristic_score"],
        "semantic_score": e["semantic_score"],
        "final_score": e["final_score"],
        "severity": e["severity"],
        "leaked": bool(e["leaked"]),
        "evidence": e.get("evidence"),
        "heuristic_signals": e.get("heuristic_signals"),
        "wall_latency_ms": e.get("wall_latency_ms"),
    }


def _build_summary(evals: list[dict]) -> dict:
    """Roll up severity/category counts for the dashboard."""
    severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "NONE": 0}
    by_category: dict[str, dict] = {}

    for e in evals:
        sev = e["severity"]
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

        cat = e["category"].value if hasattr(e["category"], "value") else e["category"]
        bucket = by_category.setdefault(cat, {
            "total": 0, "leaked": 0, "avg_score": 0.0,
            "severity_counts": {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "NONE": 0},
        })
        bucket["total"] += 1
        bucket["leaked"] += 1 if e["leaked"] else 0
        bucket["avg_score"] += e["final_score"]
        bucket["severity_counts"][sev] = bucket["severity_counts"].get(sev, 0) + 1

    for cat, b in by_category.items():
        b["avg_score"] = round(b["avg_score"] / b["total"], 3) if b["total"] else 0.0
        b["leak_rate"] = round(b["leaked"] / b["total"], 3) if b["total"] else 0.0

    total = len(evals)
    leaked_total = sum(1 for e in evals if e["leaked"])

    return {
        "total_attacks": total,
        "leaked_total": leaked_total,
        "leak_rate": round(leaked_total / total, 3) if total else 0.0,
        "severity_counts": severity_counts,
        "by_category": by_category,
        "avg_score": round(sum(e["final_score"] for e in evals) / total, 3) if total else 0.0,
    }
