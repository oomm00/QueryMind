"""
Bloom Alignment Audit — 18 Questions, 19 LLM Calls, Quota-Guarded
==================================================================
Generates exactly **one question per Bloom level per topic** (6 levels x 3 demo
topics = 18 questions) through the real generation pipeline
(``generate_question`` + Chroma retrieval), then classifies the **actual** Bloom
level of all 18 questions in **ONE batched LLM call** — 19 LLM calls per run,
never one classification call per question.

Designed to run **twice total**: once for BEFORE and once for AFTER a config
change (e.g. adding a fallback model). The output file refuses to be rewritten
unless ``--force`` is passed, so a label can't silently be re-run and burn
quota.

Quota guards (why this script exists):
  * 18 generation calls + 1 batched classification call = 19 (capped by design).
  * Calls are paced (--interval, default 13 s) to stay under the free-tier
    5-requests/minute/model limit instead of tripping 429s.
  * If a quota error appears (LLM_QUOTA_EXHAUSTED after the whole configured
    fallback chain is spent), the run STOPS immediately and reports the partial
    results — it never loops retrying.
  * A dead chain (LLM_UNAVAILABLE) and the overall --max-seconds budget also
    stop the run early with a partial report.
  * The script never touches the database (HTTP-free, DATABASE_URL-free).

Run it inside the backend container (chromadb + sentence-transformers + the
bind-mounted /app/.env are all available there)::

    docker cp scripts/bloom_audit.py querymind_backend:/tmp/bloom_audit.py
    docker exec -w /app querymind_backend python /tmp/bloom_audit.py --label before
    docker cp querymind_backend:/tmp/bloom_audit_before.json <dest>

Exit codes:
    0  full run (18 generated + batched classification ok)
    2  stopped on a quota error — partial results written
    3  output for this label already exists (use --force to override)
    5  stopped: the whole model chain was unavailable — partial results written
    6  stopped: --max-seconds time budget exhausted — partial results written
    1  fatal before/between LLM steps (config, retrieval, no material, ...)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Locate the backend ``app`` package ────────────────────────────────────────
# In the container the app lives at /app; when the script sits in the repo
# (scripts/bloom_audit.py) it is at <repo>/backend. Added before any app import.


def _bootstrap_path() -> Path:
    here = Path(__file__).resolve()
    for candidate in (Path("/app"), here.parents[1] / "backend"):
        if (candidate / "app" / "core" / "config.py").exists():
            sys.path.insert(0, str(candidate))
            return candidate
    raise SystemExit(
        "Cannot locate the backend 'app' package (looked in /app and "
        f"{here.parents[1] / 'backend'}). Run this inside the backend container: "
        "docker exec -w /app querymind_backend python /tmp/bloom_audit.py ..."
    )


APP_DIR = _bootstrap_path()

from app.core.config import settings  # noqa: E402
from app.core.exceptions import (  # noqa: E402
    LLMQuotaExhaustedError,
    LLMUnavailableError,
    NoContextError,
    QueryMindError,
    ValidationError,
)
from app.services import llm_utils  # noqa: E402
from app.services.generation_service import (  # noqa: E402
    VALID_BLOOM_LEVELS,
    _configure_genai,
    generate_question,
)
from app.services.retrieval import retrieve_context  # noqa: E402

# The three demo documents seeded by scripts/seed_demo.py (Subject / Topic).
DEMO_TOPICS = [
    ("Algorithms", "Dynamic Programming"),
    ("DBMS", "Transactions"),
    ("OS", "Deadlocks"),
]

# Six Bloom levels x three topics = 18 questions, + 1 batched classification.
LEVELS = sorted(VALID_BLOOM_LEVELS)

REPORT_VERSION = 1


# ── In-process LLM log collector ──────────────────────────────────────────────
# Captures the querymind.* log lines ("served by primary", "falling back to ...",
# transient retries, sanitized raw errors) so the report shows which models
# actually served the run — the whole point of a before/after comparison.


class _LogCollector(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.records: list[dict[str, str]] = []

    def emit(self, record: logging.LogRecord) -> None:  # noqa: D102 - never raise
        try:
            self.records.append({
                "level": record.levelname,
                "message": record.getMessage()[:300],
            })
        except Exception:  # pragma: no cover - defensive
            pass

    def count(self, needle: str) -> int:
        return sum(1 for r in self.records if needle in r["message"])


def _attach_collector() -> _LogCollector:
    collector = _LogCollector()
    root = logging.getLogger("querymind")
    root.setLevel(logging.INFO)  # INFO lines are the fallback/primary accounting
    root.addHandler(collector)
    return collector


# ── Batched classification (the single non-generation call) ───────────────────

CLASSIFY_PROMPT_HEADER = """\
You are an expert classifier of exam questions according to Bloom's taxonomy.
Below are {n} exam questions, numbered. For EACH question, decide the ACTUAL
cognitive level the question demands of a student (not what anyone intended it
to be).

Valid levels (choose exactly one per question):
  remember, understand, apply, analyze, evaluate, create

Return ONLY a raw JSON object of the form:
{{"levels": ["<level>", "<level>", ...]}}
The "levels" array must contain exactly {n} entries, in the same order as the
numbered questions. No markdown fences, no other text.

QUESTIONS:
"""


def _parse_classification(data: dict, expected: int) -> list[str]:
    levels = data.get("levels")
    if not isinstance(levels, list):
        raise ValidationError("classification JSON has no 'levels' array")
    if len(levels) != expected:
        raise ValidationError(
            f"classification returned {len(levels)} levels, expected {expected}"
        )
    normalized = [str(v).strip().lower() for v in levels]
    bad = [v for v in normalized if v not in VALID_BLOOM_LEVELS]
    if bad:
        raise ValidationError(f"classification used unknown level(s): {bad}")
    return normalized


def classify_batched(cells: list[dict], chain: list[str] | None) -> list[str]:
    """Classify every generated question's ACTUAL Bloom level in ONE LLM call."""
    lines = []
    for i, cell in enumerate(cells, 1):
        lines.append(
            f"{i}. [{cell['subject']}/{cell['topic']}] {cell['question']}\n"
        )
    prompt = CLASSIFY_PROMPT_HEADER.format(n=len(cells)) + "\n".join(lines)

    client = _configure_genai()  # JSON mime type; no schema (array payload)
    return llm_utils.call_json_with_retry(
        request_fn=lambda p: llm_utils.request_text(
            client, p, sleep=time.sleep, models=chain
        ),
        prompt=prompt,
        parse_fn=lambda raw: _parse_classification(raw, len(cells)),
    )


# ── Run ───────────────────────────────────────────────────────────────────────


def _masked_config(chain: list[str], interval: float, args: argparse.Namespace) -> dict:
    return {
        "app_dir": str(APP_DIR),
        "primary_model": settings.llm_model,
        "fallback_models": settings.fallback_models,
        "model_chain": chain,
        "temperature": settings.llm_temperature,
        "thinking_level": settings.llm_thinking_level,
        "max_output_tokens": settings.llm_max_output_tokens,
        "api_key": "set" if settings.gemini_api_key else "missing",
        "chroma": f"{settings.chroma_host}:{settings.chroma_port}",
        "interval_seconds": interval,
        "max_seconds": args.max_seconds,
        "difficulty": args.difficulty,
        "question_type": args.question_type,
    }


def run(args: argparse.Namespace) -> int:
    output = Path(args.output or f"/tmp/bloom_audit_{args.label}.json")
    if output.exists() and not args.force:
        print(
            f"Refusing to re-run label '{args.label}': {output} already exists.\n"
            "Audits are meant to run ONCE for BEFORE and ONCE for AFTER — not "
            "repeatedly (each run costs up to 19 LLM calls). Pass --force to "
            "overwrite deliberately."
        )
        return 3

    topics = [tuple(t.split("/", 1)) for t in args.topic] if args.topic else DEMO_TOPICS
    chain = llm_utils.resolve_model_chain(settings.llm_model)
    collector = _attach_collector()

    print(f"Bloom audit [{args.label}] — {len(LEVELS)} levels x {len(topics)} topics "
          f"= {len(LEVELS) * len(topics)} questions + 1 batched classification")
    print(f"  app dir : {APP_DIR}")
    print(f"  models  : {' -> '.join(chain) if chain else settings.llm_model}")
    print(f"  api key : {'set' if settings.gemini_api_key else 'MISSING'}")
    if not settings.gemini_api_key:
        print("FATAL: GEMINI_API_KEY is not configured.")
        return 1

    started = datetime.now(timezone.utc)
    deadline = time.monotonic() + args.max_seconds
    stop: dict[str, Any] | None = None  # {"reason":..., "stage":..., "index":...}
    cells: list[dict] = []
    classified_levels: list[str] | None = None
    classify_error: str | None = None
    steps = 0  # LLM steps completed (for pacing)

    def pace() -> None:
        nonlocal steps
        if steps and args.interval > 0:
            time.sleep(args.interval)
        steps += 1

    # ── Retrieve context once per topic (no LLM calls; fail fast before any) ──
    chunks_by_topic: dict[tuple[str, str], list[dict]] = {}
    for subject, topic in topics:
        try:
            chunks = retrieve_context(topic=topic, subject=subject)
        except Exception as exc:  # noqa: BLE001 - config/transport problem, not quota
            print(f"FATAL: retrieval failed for {subject} / {topic}: {exc}")
            return 1
        if not chunks:
            print(
                f"FATAL: no study material for {subject} / {topic} — nothing to "
                "ground questions on. Run scripts/seed_demo.py first."
            )
            return 1
        chunks_by_topic[(subject, topic)] = chunks
        print(f"  retrieved {len(chunks)} chunk(s) for {subject} / {topic}")

    # ── 18 generation calls, paced, stopping on quota ─────────────────────────
    total = len(LEVELS) * len(topics)
    index = 0
    for subject, topic in topics:
        for level in LEVELS:
            index += 1
            cell: dict[str, Any] = {
                "index": index,
                "subject": subject,
                "topic": topic,
                "bloom_requested": level,
                "status": "failed",
                "question": None,
                "bloom_returned": None,
                "self_aligned": False,
                "classified_as": None,
                "aligned": None,
                "seconds": None,
                "error": None,
            }
            if stop is not None:
                cells.append(cell)  # placeholder keeps the planned-grid visible
                continue
            if time.monotonic() > deadline:
                stop = {"reason": "time_budget", "stage": "generation", "index": index}
                cells.append(cell)
                continue

            pace()
            print(f"  [gen {index:02d}/{total}] {subject} / {topic} — {level} ... ",
                  end="", flush=True)
            t0 = time.monotonic()
            try:
                generated = generate_question(
                    topic=topic,
                    subject=subject,
                    bloom_level=level,
                    difficulty=args.difficulty,
                    question_type=args.question_type,
                    context_chunks=chunks_by_topic[(subject, topic)],
                )
            except (LLMQuotaExhaustedError,) as exc:
                stop = {"reason": "quota", "stage": "generation", "index": index}
                cell["error"] = {"type": type(exc).__name__, "code":
                                 getattr(exc, "code", None), "detail": str(exc)}
                cells.append(cell)
                print(f"STOP ({type(exc).__name__}: {getattr(exc, 'code', '?')})")
                continue
            except LLMUnavailableError as exc:
                stop = {"reason": "unavailable", "stage": "generation", "index": index}
                cell["error"] = {"type": type(exc).__name__, "code":
                                 getattr(exc, "code", None), "detail": str(exc)}
                cells.append(cell)
                print(f"STOP ({type(exc).__name__}: {getattr(exc, 'code', '?')})")
                continue
            except QueryMindError as exc:
                cell["error"] = {"type": type(exc).__name__, "code":
                                 getattr(exc, "code", None), "detail": str(exc)}
            except Exception as exc:  # noqa: BLE001 - record and move on (no retry loop)
                cell["error"] = {"type": type(exc).__name__, "detail": str(exc)[:300]}
            else:
                cell["status"] = "ok"
                cell["question"] = generated.question
                cell["bloom_returned"] = generated.bloom_level
                cell["self_aligned"] = generated.bloom_level == level
            cell["seconds"] = round(time.monotonic() - t0, 2)
            cells.append(cell)
            if cell["status"] == "ok":
                print(f"ok ({cell['seconds']}s, returned={cell['bloom_returned']})")
            else:
                err = cell["error"] or {}
                print(f"failed ({err.get('type')}: {err.get('code') or err.get('detail', '')[:80]})")

    ok_cells = [c for c in cells if c["status"] == "ok"]

    # ── ONE batched classification call over every generated question ─────────
    if stop is None and ok_cells:
        if time.monotonic() > deadline:
            stop = {"reason": "time_budget", "stage": "classification", "index": None}
        else:
            pace()
            print(f"  [classify] batched Bloom classification of "
                  f"{len(ok_cells)} question(s) in ONE call ... ",
                  end="", flush=True)
            t0 = time.monotonic()
            try:
                classified_levels = classify_batched(ok_cells, chain)
                for cell, level in zip(ok_cells, classified_levels):
                    cell["classified_as"] = level
                    cell["aligned"] = level == cell["bloom_requested"]
                print(f"ok ({time.monotonic() - t0:.1f}s)")
            except (LLMQuotaExhaustedError, LLMUnavailableError) as exc:
                stop = {"reason": "quota" if isinstance(exc, LLMQuotaExhaustedError)
                        else "unavailable",
                        "stage": "classification", "index": None}
                classify_error = f"{type(exc).__name__}: {getattr(exc, 'code', '?')}"
                print(f"STOP ({classify_error})")
            except Exception as exc:  # noqa: BLE001 - malformed JSON etc.
                classify_error = f"{type(exc).__name__}: {str(exc)[:200]}"
                print(f"failed ({classify_error})")

    # ── Report ────────────────────────────────────────────────────────────────
    finished = datetime.now(timezone.utc)
    confusion: dict[str, dict[str, int]] = {}
    aligned_count = 0
    for cell in ok_cells:
        req = cell["bloom_requested"]
        got = cell.get("classified_as") or "(not classified)"
        confusion.setdefault(req, {})
        confusion[req][got] = confusion[req].get(got, 0) + 1
        if cell["aligned"]:
            aligned_count += 1
    self_aligned_count = sum(1 for c in ok_cells if c["self_aligned"])
    n_ok = len(ok_cells)

    report = {
        "report_version": REPORT_VERSION,
        "label": args.label,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_seconds": round((finished - started).total_seconds(), 1),
        "config": _masked_config(chain or [settings.llm_model], args.interval, args),
        "grid": {"topics": [f"{s} / {t}" for s, t in topics],
                 "levels": LEVELS, "planned_questions": total},
        "stop": stop,
        "classification": {
            "ok": classified_levels is not None,
            "count": len(classified_levels or []),
            "error": classify_error,
        },
        "cells": cells,
        "summary": {
            "generated_ok": n_ok,
            "failed": total - n_ok,
            "llm_calls_planned": total + 1,
            "aligned": aligned_count,
            "alignment_pct": round(100 * aligned_count / n_ok, 1) if n_ok else None,
            "self_aligned": self_aligned_count,
            "self_alignment_pct": round(100 * self_aligned_count / n_ok, 1) if n_ok else None,
            "confusion": confusion,
        },
        "llm_log": {
            "served_primary": collector.count("served by primary"),
            "served_fallback": collector.count("served by fallback"),
            "fallback_events": collector.count("falling back to"),
            "transient_retries": collector.count("Transient LLM error"),
            "records": collector.records,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Console summary ───────────────────────────────────────────────────────
    print(f"\n  generated {n_ok}/{total} question(s), "
          f"{total - n_ok} failed")
    if classified_levels is not None:
        print(f"  alignment (requested == batched-classified): "
              f"{aligned_count}/{n_ok} = {report['summary']['alignment_pct']}%")
        print(f"  self-reported (requested == model's own bloom_level): "
              f"{self_aligned_count}/{n_ok}")
        for req in LEVELS:
            if req in confusion:
                print(f"    {req:11s} -> {confusion[req]}")
    print(f"  LLM: primary served {report['llm_log']['served_primary']}, "
          f"fallback served {report['llm_log']['served_fallback']}, "
          f"fallback events {report['llm_log']['fallback_events']}, "
          f"transient retries {report['llm_log']['transient_retries']}")
    if stop:
        print(f"  STOPPED ({stop['reason']} during {stop['stage']}) — "
              "partial results written; NOT retrying.")
    print(f"  report: {output}")

    if stop and stop["reason"] == "quota":
        return 2
    if stop and stop["reason"] == "unavailable":
        return 5
    if stop and stop["reason"] == "time_budget":
        return 6
    if classify_error and classified_levels is None:
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bloom alignment audit (18 + 1 LLM calls)")
    parser.add_argument("--label", required=True, choices=["before", "after"],
                        help="BEFORE or AFTER run label (also names the output file)")
    parser.add_argument("--output", default=None,
                        help="report path (default: /tmp/bloom_audit_<label>.json)")
    parser.add_argument("--topic", action="append", default=None,
                        help="Subject/Topic to audit (repeatable; default: the 3 demo topics)")
    parser.add_argument("--difficulty", default="medium", choices=["easy", "medium", "hard"],
                        help="difficulty used for every generated question (default: medium)")
    parser.add_argument("--question-type", default="descriptive",
                        choices=["descriptive", "mcq", "short_answer", "coding"],
                        help="question type for every generated question (default: descriptive)")
    parser.add_argument("--interval", type=float, default=13.0,
                        help="seconds to sleep between LLM calls — keeps the run under "
                             "the 5 req/min/model free tier (default: 13, 0 disables)")
    parser.add_argument("--max-seconds", type=float, default=700.0,
                        help="overall budget; exceeding it stops with a partial report "
                             "(default: 700)")
    parser.add_argument("--force", action="store_true",
                        help="overwrite an existing report for this label (breaks the "
                             "run-once-per-label guard)")
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
