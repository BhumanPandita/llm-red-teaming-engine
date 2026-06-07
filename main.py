"""
main.py — Entry point for the Adversarial RAG & LLM Red-Teaming Engine.

Wires the four modules together into a single CLI-driven campaign:

    Attacker (Groq/Llama) → Executor (asyncio) → Target RAG (Gemini) → Evaluator (Groq/Llama)

Usage examples:
    # Full campaign, all 8 attack categories, default settings
    python main.py

    # Fast smoke test — seeds only, 2 categories, concurrency 3
    python main.py --categories direct_extraction,roleplay_jailbreak --no-seeds-off --attacks-per-category 0 --concurrency 3

    # High-volume run — 5 LLM prompts per category, concurrency 8
    python main.py --attacks-per-category 5 --concurrency 8

    # Target specific categories, save report to custom path
    python main.py --categories prompt_injection,encoding_obfuscation --output reports/injection_test.csv
"""

import argparse
import asyncio
import os
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

from attacker import AttackCategory, init_attack_db
from evaluator import evaluate_campaign, export_csv, generate_report, init_eval_db, print_summary
from executor import init_exec_db, run_campaign
from target_rag import init_db

load_dotenv()

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

_BANNER = r"""
 ____  _____    ____    _____              _
|  _ \|  ___|  / ___|  |_   _|__  ___  __| | ___  _ __
| |_) | |_    | |   _____| |/ _ \/ __|/ _` |/ _ \| '__|
|  _ <|  _|   | |__|_____| |  __/\__ \ (_| | (_) | |
|_| \_\_|      \____|    |_|\___||___/\__,_|\___/|_|

  Adversarial RAG & LLM Red-Teaming Engine  |  POC v0.1
  Target: Gemma 3 27B (Gemini API)  |  Attacker/Judge: Groq Llama-3.3-70B
"""

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

_ALL_CATEGORIES = [c.value for c in AttackCategory]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="main.py",
        description="Adversarial RAG & LLM Red-Teaming Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Attack categories:\n"
            + "\n".join(f"  {c}" for c in _ALL_CATEGORIES)
        ),
    )

    parser.add_argument(
        "--categories",
        default=",".join(_ALL_CATEGORIES),
        metavar="CAT1,CAT2,...",
        help=(
            "Comma-separated attack categories to run. "
            f"Default: all {len(_ALL_CATEGORIES)}. "
            f"Choices: {', '.join(_ALL_CATEGORIES)}"
        ),
    )
    parser.add_argument(
        "--attacks-per-category",
        type=int,
        default=3,
        metavar="N",
        help="LLM-generated prompts per category (default: 3). Set 0 for seeds only.",
    )
    parser.add_argument(
        "--no-seeds",
        action="store_true",
        help="Skip hardcoded seed attacks; use only LLM-generated prompts.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        metavar="N",
        help="Max simultaneous requests against the Target RAG (default: 5).",
    )
    parser.add_argument(
        "--eval-concurrency",
        type=int,
        default=3,
        metavar="N",
        help="Max simultaneous judge LLM calls during evaluation (default: 3).",
    )
    parser.add_argument(
        "--db-path",
        default=os.getenv("DB_PATH", "rag_interactions.db"),
        metavar="PATH",
        help="SQLite database file path (default: rag_interactions.db).",
    )
    parser.add_argument(
        "--output",
        default="vulnerability_report.csv",
        metavar="PATH",
        help="CSV report output path (default: vulnerability_report.csv).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-attack progress lines; show only the final report.",
    )

    return parser.parse_args()


def _resolve_categories(raw: str) -> list[AttackCategory]:
    """Parse and validate the --categories argument."""
    requested = [s.strip() for s in raw.split(",") if s.strip()]
    valid = {c.value: c for c in AttackCategory}
    resolved: list[AttackCategory] = []
    bad: list[str] = []

    for name in requested:
        if name in valid:
            resolved.append(valid[name])
        else:
            bad.append(name)

    if bad:
        print(f"[ERROR] Unknown category/ies: {', '.join(bad)}")
        print(f"        Valid choices: {', '.join(_ALL_CATEGORIES)}")
        sys.exit(1)

    return resolved


def _check_env() -> None:
    """Abort early if required API keys are missing."""
    missing = [k for k in ("GEMINI_API_KEY", "GROQ_API_KEY") if not os.getenv(k)]
    if missing:
        print("[ERROR] Missing required environment variables:")
        for k in missing:
            print(f"        {k}  — add it to your .env file")
        sys.exit(1)
    # Warn if keys look like placeholders
    for key in ("GEMINI_API_KEY", "GROQ_API_KEY"):
        val = os.getenv(key, "")
        if "your_" in val.lower() or val.endswith("_here"):
            print(f"[WARN]  {key} looks like a placeholder value — update your .env")

# ---------------------------------------------------------------------------
# Async entry point
# ---------------------------------------------------------------------------

async def run(args: argparse.Namespace) -> int:
    """
    Orchestrates the full red-team campaign.
    Returns 0 on success, 1 on failure.
    """
    categories = _resolve_categories(args.categories)
    verbose    = not args.quiet

    print(_BANNER)
    print(f"  Started      : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Database     : {args.db_path}")
    print(f"  Categories   : {len(categories)} ({', '.join(c.value for c in categories)})")
    print(f"  Seeds        : {'no' if args.no_seeds else 'yes'}")
    print(f"  LLM attacks  : {args.attacks_per_category} per category")
    print(f"  Concurrency  : {args.concurrency} (target)  /  {args.eval_concurrency} (judge)")
    print(f"  Report out   : {args.output}")
    print()

    # ── 1. Initialise database ──────────────────────────────────────────────
    try:
        conn = init_db(args.db_path)
        init_attack_db(conn)
        init_exec_db(conn)
        init_eval_db(conn)
    except Exception as exc:
        print(f"[ERROR] Failed to initialise database: {exc}")
        return 1

    wall_start = time.monotonic()

    try:
        # ── 2. Execute campaign ─────────────────────────────────────────────
        results = await run_campaign(
            conn,
            concurrency=args.concurrency,
            categories=categories,
            attacks_per_category=args.attacks_per_category,
            include_seeds=not args.no_seeds,
            verbose=verbose,
        )

        if not results:
            print("[WARN] Campaign produced zero results — check API keys and quotas.")
            return 1

        # ── 3. Evaluate results ─────────────────────────────────────────────
        evaluations = await evaluate_campaign(
            results,
            conn,
            concurrency=args.eval_concurrency,
            verbose=verbose,
        )

        # ── 4. Report ───────────────────────────────────────────────────────
        df = generate_report(evaluations)
        print_summary(df)
        export_csv(df, args.output)

    except KeyboardInterrupt:
        print("\n\n  [INTERRUPTED]  Campaign stopped by user. Partial results may be in the DB.")
        return 1

    except Exception as exc:
        print(f"\n[ERROR] Unexpected error during campaign: {exc}")
        raise

    finally:
        conn.close()

    total_s = time.monotonic() - wall_start
    print(f"  Total wall time : {total_s:.1f}s")
    print(f"  All done.\n")
    return 0


# ---------------------------------------------------------------------------
# Synchronous entry point
# ---------------------------------------------------------------------------

def main() -> None:
    args = _parse_args()
    _check_env()
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
