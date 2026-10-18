"""
Bloom Alignment + Quality Audit — Quota-Guarded, One Batched Judge Call
=======================================================================
Generates exactly **one question per Bloom level per topic** (6 levels x 3 demo
topics = 18 questions by default) through the real generation pipeline
(``generate_question`` + Chroma retrieval), then in **ONE batched LLM call**
judgets every question: the ACTUAL Bloom level plus four 1-5 quality scores
(specificity, groundedness, concreteness for Apply+, single concept).
Deterministic verb-compliance (allowed/forbidden stem check) is computed in
process — no extra LLM calls. 19 LLM calls per generation run, 1 per rescore.

Modes:
  * generation (default): generate 18 questions + judge them (19 calls).
  * ``--rescore PATH``: load a previous report, re-retrieve its topics' context,
    re-run ONLY the batched judge (1 call) + deterministic checks, and write a
    ``*_judged.json`` — used to give the BEFORE report the same scoring as AFTER.

Quota guards (why this script exists):
  * 18 generation calls + 1 batched judge call = 19 (capped by design).
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
    0  full run (18 generated + batched judge ok)
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
import statistics
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
    QueryMindError,
    ValidationError,
)
from app.services import llm_utils  # noqa: E402
from app.services.generation_service import (  # noqa: E402
    VALID_BLOOM_LEVELS,
    _configure_genai,
    check_stem,
    generate_question,
)
from app.services.retrieval import retrieve_context  # noqa: E402

# The three demo documents seeded by scripts/seed_demo.py (Subject / Topic).
DEMO_TOPICS = [
    ("Algorithms", "Dynamic Programming"),
    ("DBMS", "Transactions"),
    ("OS", "Deadlocks"),
]

# Six Bloom levels x three topics = 18 questions, + 1 batched judge call.
LEVELS = sorted(VALID_BLOOM_LEVELS)

QUALITY_DIMENSIONS = ("specificity", "groundedness", "concreteness", "single_concept")

REPORT_VERSION = 2


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


# ── Deterministic stem compliance (no LLM) ────────────────────────────────────


def stem_compliance(cell: dict) -> None:
    """Attach the deterministic verb/stem check to *cell* (in place)."""
    if cell.get("status") != "ok" or not cell.get("question"):
        cell["stem"] = None
        cell["stem_compliant"] = None
        return
    result = check_stem(cell["question"], cell["bloom_requested"])
    cell["stem"] = {
        "first_word": result["stem"],
        "opening": result["opening"],
        "allowed_hit": result["allowed_hit"],
        "forbidden_hit": result["forbidden_hit"],
    }
    cell["stem_compliant"] = result["is_compliant"]


# ── Batched judge (the single non-generation call) ───────────────────────────

JUDGE_PROMPT_HEADER = """\
You are an expert reviewer of exam questions (Bloom's taxonomy + question quality).
Below are {n} exam questions, numbered, each shown with the source material it is
supposed to be grounded in.

For EACH question provide:
1. "actual_level": the ACTUAL cognitive level the question demands of a student
   (not what it was intended to be):
   remember (recall facts/definitions) | understand (explain/paraphrase) |
   apply (use knowledge in a concrete specific situation) |
   analyze (break into parts, compare, distinguish causes/effects) |
   evaluate (judge/critique against criteria) | create (design/synthesize new)
2. "specificity" (integer 1-5): 1 = generic and vague, 5 = concrete and precise
   (names entities, numbers, steps, or a specific case).
3. "groundedness" (integer 1-5): 1 = answerable only from general knowledge,
   ignoring the source shown; 5 = every premise needed to answer sits in the
   source material shown.
4. "concreteness" (integer 1-5): 1 = asks to "explain/describe X" in the
   abstract; 5 = hinges on a concrete scenario, numbers, or a small worked case
   drawn from the source. For remember/understand questions, score how directly
   it pins a concrete fact rather than a broad notion.
5. "single_concept" (integer 1-5): 1 = bundles several distinct sub-questions;
   5 = one clear, focused cognitive task.

Return ONLY a raw JSON object (no markdown fences):
{{"results": [{{"id": 1, "actual_level": "<level>", "specificity": 3,
  "groundedness": 4, "concreteness": 2, "single_concept": 4}}, ...]}}
Exactly {n} results with ids 1..{n}, in order.

QUESTIONS:
"""


def _parse_judgement(data: dict, expected: int) -> list[dict]:
    results = data.get("results")
    if not isinstance(results, list):
        raise ValidationError("judge JSON has no 'results' array")
    if len(results) != expected:
        raise ValidationError(
            f"judge returned {len(results)} results, expected {expected}"
        )
    parsed: list[dict] = []
    for i, item in enumerate(results, 1):
        if not isinstance(item, dict):
            raise ValidationError(f"judge result {i} is not an object")
        level = str(item.get("actual_level", "")).strip().lower()
        if level not in VALID_BLOOM_LEVELS:
            raise ValidationError(f"judge result {i} used unknown level {level!r}")
        scores: dict[str, int] = {}
        for dim in QUALITY_DIMENSIONS:
            try:
                value = float(item.get(dim))
            except (TypeError, ValueError):
                raise ValidationError(f"judge result {i} missing score {dim!r}") from None
            scores[dim] = max(1, min(5, int(round(value))))  # clamp into 1-5
        parsed.append({"id": i, "actual_level": level, **scores})
    return parsed


def judge_batched(cells: list[dict], chain: list[str] | None,
                  contexts: dict[tuple[str, str], list[dict]]) -> list[dict]:
    """Judge every generated question (level + 4 quality scores) in ONE call."""
    lines = []
    for i, cell in enumerate(cells, 1):
        chunks = contexts.get((cell["subject"], cell["topic"]), [])
        source = "\n".join(str(c.get("text", "")) for c in chunks)[:900] or "(none)"
        lines.append(
            f"{i}. [{cell['subject']}/{cell['topic']}] "
            f"(requested level: {cell['bloom_requested']})\n"
            f"Question: {cell['question']}\n"
            f"Source material: {source}\n"
        )
    prompt = JUDGE_PROMPT_HEADER.format(n=len(cells)) + "\n".join(lines)

    client = _configure_genai()  # JSON mime type; no schema (array payload)
    return llm_utils.call_json_with_retry(
        request_fn=lambda p: llm_utils.request_text(
            client, p, sleep=time.sleep, models=chain
        ),
        prompt=prompt,
        parse_fn=lambda raw: _parse_judgement(raw, len(cells)),
    )


def _apply_judgements(ok_cells: list[dict], judgements: list[dict]) -> None:
    for cell, verdict in zip(ok_cells, judgements):
        cell["classified_as"] = verdict["actual_level"]
        cell["aligned"] = verdict["actual_level"] == cell["bloom_requested"]
        cell["scores"] = {dim: verdict[dim] for dim in QUALITY_DIMENSIONS}


# ── Summaries (shared by generation + rescore) ────────────────────────────────


def build_summaries(cells: list[dict]) -> tuple[dict, dict[str, dict[str, Any]]]:
    """Overall + per-level verdicts: verb compliance, level match, scores, latency."""
    ok_cells = [c for c in cells if c.get("status") == "ok" and c.get("question")]
    by_level: dict[str, dict[str, Any]] = {}
    for level in LEVELS:
        rows = [c for c in ok_cells if c["bloom_requested"] == level]
        if not rows:
            continue
        compliant = [c for c in rows if c.get("stem_compliant")]
        judged = [c for c in rows if c.get("classified_as")]
        matched = [c for c in judged if c["aligned"]]
        entry: dict[str, Any] = {
            "n": len(rows),
            "verb_compliant": len(compliant),
            "verb_compliance_pct": round(100 * len(compliant) / len(rows), 1),
            "level_matched": len(matched),
            "level_match_pct": (
                round(100 * len(matched) / len(judged), 1) if judged else None
            ),
        }
        for dim in QUALITY_DIMENSIONS:
            values = [c["scores"][dim] for c in rows if c.get("scores")]
            entry[dim] = round(statistics.mean(values), 2) if values else None
        seconds = [c["seconds"] for c in rows if c.get("seconds")]
        entry["mean_seconds"] = round(statistics.mean(seconds), 2) if seconds else None
        by_level[level] = entry

    n_ok = len(ok_cells)
    overall_scores = {}
    for dim in QUALITY_DIMENSIONS:
        values = [c["scores"][dim] for c in ok_cells if c.get("scores")]
        overall_scores[dim] = round(statistics.mean(values), 2) if values else None
    judged = [c for c in ok_cells if c.get("classified_as")]
    overall = {
        "n_ok": n_ok,
        "verb_compliant": sum(1 for c in ok_cells if c.get("stem_compliant")),
        "verb_compliance_pct": (
            round(100 * sum(1 for c in ok_cells if c.get("stem_compliant")) / n_ok, 1)
            if n_ok else None
        ),
        "level_matched": sum(1 for c in judged if c.get("aligned")),
        "level_match_pct": (
            round(100 * sum(1 for c in judged if c.get("aligned")) / len(judged), 1)
            if judged else None
        ),
        "scores": overall_scores,
    }
    return overall, by_level


def print_tables(overall: dict, by_level: dict[str, dict[str, Any]]) -> None:
    header = (
        "  level      | verb-compliant | level-match | specificity | groundedness |"
        " concreteness | single-concept |  n | mean sec"
    )
    print("\n" + header)
    print("  " + "-" * (len(header) - 2))
    for level in LEVELS:
        entry = by_level.get(level)
        if not entry:
            continue

        def pct(value: Any) -> str:
            return f"{value:5.1f}%" if value is not None else "   n/a"

        def mean(dim: str) -> str:
            value = entry.get(dim)
            return f"{value:10.2f}" if value is not None else "      n/a"

        seconds = entry.get("mean_seconds")
        print(
            f"  {level:10s} | {pct(entry['verb_compliance_pct']):14s} | "
            f"{pct(entry['level_match_pct']):11s} |"
            f"{mean('specificity')} |{mean('groundedness')} |"
            f"{mean('concreteness')} |{mean('single_concept')} | "
            f"{entry['n']:2d} | "
            f"{f'{seconds:7.2f}' if seconds is not None else '    n/a'}"
        )
    print(
        f"  OVERALL    | {pct(overall['verb_compliance_pct']):14s} | "
        f"{pct(overall['level_match_pct']):11s} |"
        f"{mean_ov(overall, 'specificity')} |{mean_ov(overall, 'groundedness')} |"
        f"{mean_ov(overall, 'concreteness')} |{mean_ov(overall, 'single_concept')} | "
        f"{overall['n_ok']:2d}"
    )


def mean_ov(overall: dict, dim: str) -> str:
    value = overall["scores"].get(dim)
    return f"{value:10.2f}" if value is not None else "      n/a"


# ── Markdown dump ─────────────────────────────────────────────────────────────


def write_markdown(path: Path, report: dict) -> None:
    lines = [
        f"# Bloom audit ({report['label']}) — raw questions",
        "",
        f"- mode: {report['mode']}",
        f"- generated: {report['finished_at']}",
        f"- label: {report['label']}",
        "",
    ]
    for cell in report["cells"]:
        if cell.get("status") != "ok" or not cell.get("question"):
            continue
        scores = cell.get("scores") or {}
        score_str = " / ".join(
            f"{dim[:5]} {scores.get(dim, '-')}" for dim in QUALITY_DIMENSIONS
        )
        stem = cell.get("stem") or {}
        verdict = (
            "compliant" if cell.get("stem_compliant") else f"VIOLATION ({stem.get('forbidden_hit') or 'no allowed stem'})"
        )
        seconds = cell.get("seconds")
        lines.append(
            f"## {cell['index']:02d} | {cell['bloom_requested']} | "
            f"{cell['subject']}/{cell['topic']}"
        )
        lines.append("")
        lines.append(
            f"- requested: {cell['bloom_requested']} | classified: "
            f"{cell.get('classified_as') or '-'} | stem: \"{stem.get('first_word', '-')}\" "
            f"({verdict}) | scores: {score_str} | "
            f"{f'{seconds}s' if seconds is not None else 'n/a'}"
        )
        lines.append("")
        lines.append(f"> {cell['question']}")
        lines.append("")
    lines += [
        "## Summary",
        "",
        "| level | verb-compliant | level-match | specificity | groundedness | "
        "concreteness | single-concept | n |",
        "|---|---|---|---|---|---|---|---|",
    ]
    by_level = report["summary"].get("by_level", {})
    for level in LEVELS:
        entry = by_level.get(level)
        if not entry:
            continue
        lines.append(
            f"| {level} | {entry['verb_compliance_pct']}% | "
            f"{entry['level_match_pct'] if entry['level_match_pct'] is not None else 'n/a'}% | "
            f"{entry['specificity']} | {entry['groundedness']} | "
            f"{entry['concreteness']} | {entry['single_concept']} | {entry['n']} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── Config + report plumbing ──────────────────────────────────────────────────


def _masked_config(chain: list[str], interval: float, args: argparse.Namespace) -> dict:
    return {
        "app_dir": str(APP_DIR),
        "primary_model": settings.llm_model,
        "fallback_models": settings.fallback_models,
        "model_chain": chain,
        "temperature": settings.llm_temperature,
        "thinking_level": settings.llm_thinking_level,
        "gen_thinking_level": settings.llm_gen_thinking_level,
        "bloom_alignment_tolerance": settings.bloom_alignment_tolerance,
        "max_output_tokens": settings.llm_max_output_tokens,
        "api_key": "set" if settings.gemini_api_key else "missing",
        "chroma": f"{settings.chroma_host}:{settings.chroma_port}",
        "interval_seconds": interval,
        "max_seconds": args.max_seconds,
        "difficulty": args.difficulty,
        "question_type": args.question_type,
    }


def _topics_from_args(args: argparse.Namespace) -> list[tuple[str, str]]:
    raw = getattr(args, "topics", None)
    return [tuple(t.split("/", 1)) for t in raw] if raw else DEMO_TOPICS


def _write_report(output: Path, report: dict, label: str) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path = output.with_suffix(".md")
    try:
        write_markdown(md_path, report)
        print(f"  markdown: {md_path}")
    except Exception as exc:  # noqa: BLE001 - the JSON report is the source of truth
        print(f"  markdown dump failed ({exc}) — JSON report unaffected")
    print(f"  report: {output}")
    return output


def _guard(output: Path, label: str, args: argparse.Namespace) -> bool:
    """Run-once-per-label guard. Returns True when it is OK to proceed."""
    if output.exists() and not args.force:
        print(
            f"Refusing to re-run label '{label}': {output} already exists.\n"
            "Audits are meant to run ONCE per label — not repeatedly (each run "
            "costs up to 19 LLM calls). Pass --force to overwrite deliberately."
        )
        return False
    return True


def _stop_exit(stop: dict | None, classify_error: str | None) -> int:
    if stop and stop["reason"] == "quota":
        return 2
    if stop and stop["reason"] == "unavailable":
        return 5
    if stop and stop["reason"] == "time_budget":
        return 6
    if classify_error:
        return 1
    return 0


# ── Generation mode ───────────────────────────────────────────────────────────


def run(args: argparse.Namespace) -> int:
    output = Path(args.output or f"/tmp/bloom_audit_{args.label}.json")
    if not _guard(output, args.label, args):
        return 3

    topics = _topics_from_args(args)
    chain = llm_utils.resolve_model_chain(settings.llm_model)
    collector = _attach_collector()

    print(f"Bloom audit [{args.label}] — {len(LEVELS)} levels x {len(topics)} topics "
          f"= {len(LEVELS) * len(topics)} questions + 1 batched judge call")
    print(f"  app dir : {APP_DIR}")
    print(f"  models  : {' -> '.join(chain) if chain else settings.llm_model}")
    print(f"  gen thinking: {settings.llm_gen_thinking_level} "
          f"(eval: {settings.llm_thinking_level})")
    print(f"  api key : {'set' if settings.gemini_api_key else 'MISSING'}")
    if not settings.gemini_api_key:
        print("FATAL: GEMINI_API_KEY is not configured.")
        return 1

    started = datetime.now(timezone.utc)
    deadline = time.monotonic() + args.max_seconds
    stop: dict[str, Any] | None = None  # {"reason":..., "stage":..., "index":...}
    cells: list[dict] = []
    judgements: list[dict] | None = None
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
                "stem": None,
                "stem_compliant": None,
                "scores": None,
                "context_chars": None,
                "context_warning": None,
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
                cell["context_warning"] = generated.context_warning
            cell["context_chars"] = sum(
                len(str(c.get("text", ""))) for c in chunks_by_topic[(subject, topic)]
            )
            cell["seconds"] = round(time.monotonic() - t0, 2)
            stem_compliance(cell)
            cells.append(cell)
            if cell["status"] == "ok":
                note = " [thin-context warning]" if cell["context_warning"] else ""
                print(f"ok ({cell['seconds']}s, returned={cell['bloom_returned']}, "
                      f"stem={'ok' if cell['stem_compliant'] else 'VIOLATION'}{note})")
            else:
                err = cell["error"] or {}
                print(f"failed ({err.get('type')}: {err.get('code') or err.get('detail', '')[:80]})")

    ok_cells = [c for c in cells if c["status"] == "ok"]

    # ── ONE batched judge call over every generated question ──────────────────
    if stop is None and ok_cells:
        if time.monotonic() > deadline:
            stop = {"reason": "time_budget", "stage": "classification", "index": None}
        else:
            pace()
            print(f"  [judge] batched level + quality judgement of "
                  f"{len(ok_cells)} question(s) in ONE call ... ",
                  end="", flush=True)
            t0 = time.monotonic()
            try:
                judgements = judge_batched(ok_cells, chain, chunks_by_topic)
                _apply_judgements(ok_cells, judgements)
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
    for cell in ok_cells:
        req = cell["bloom_requested"]
        got = cell.get("classified_as") or "(not judged)"
        confusion.setdefault(req, {})
        confusion[req][got] = confusion[req].get(got, 0) + 1
    overall, by_level = build_summaries(cells)

    report = {
        "report_version": REPORT_VERSION,
        "mode": "generation",
        "label": args.label,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_seconds": round((finished - started).total_seconds(), 1),
        "config": _masked_config(chain or [settings.llm_model], args.interval, args),
        "grid": {"topics": [f"{s} / {t}" for s, t in topics],
                 "levels": LEVELS, "planned_questions": total},
        "stop": stop,
        "classification": {
            "ok": judgements is not None,
            "count": len(judgements or []),
            "error": classify_error,
        },
        "cells": cells,
        "summary": {
            "generated_ok": overall["n_ok"],
            "failed": total - overall["n_ok"],
            "llm_calls_planned": total + 1,
            "aligned": overall["level_matched"],
            "alignment_pct": overall["level_match_pct"],
            "verb_compliant": overall["verb_compliant"],
            "verb_compliance_pct": overall["verb_compliance_pct"],
            "scores": overall["scores"],
            "by_level": by_level,
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
    _write_report(output, report, args.label)

    # ── Console summary ───────────────────────────────────────────────────────
    print(f"\n  generated {overall['n_ok']}/{total} question(s), "
          f"{total - overall['n_ok']} failed")
    print_tables(overall, by_level)
    print(f"  LLM: primary served {report['llm_log']['served_primary']}, "
          f"fallback served {report['llm_log']['served_fallback']}, "
          f"fallback events {report['llm_log']['fallback_events']}, "
          f"transient retries {report['llm_log']['transient_retries']}")
    if stop:
        print(f"  STOPPED ({stop['reason']} during {stop['stage']}) — "
              "partial results written; NOT retrying.")
    return _stop_exit(stop, classify_error if judgements is None else None)


# ── Rescore mode (1 judge call, no generation) ────────────────────────────────


def rescore(args: argparse.Namespace) -> int:
    source = Path(args.rescore)
    if not source.exists():
        print(f"FATAL: cannot rescore — {source} does not exist.")
        return 1
    original = json.loads(source.read_text(encoding="utf-8"))
    output = Path(args.output or f"/tmp/bloom_audit_{args.label}_judged.json")
    if not _guard(output, args.label, args):
        return 3

    chain = llm_utils.resolve_model_chain(settings.llm_model)
    collector = _attach_collector()
    rescore_started = datetime.now(timezone.utc)
    print(f"Bloom re-score [{args.label}] — 1 batched judge call over "
          f"{sum(1 for c in original['cells'] if c.get('status') == 'ok')} "
          f"existing question(s) from {source.name}")

    topics = sorted({(c["subject"], c["topic"]) for c in original["cells"]})
    contexts: dict[tuple[str, str], list[dict]] = {}
    for subject, topic in topics:
        try:
            chunks = retrieve_context(topic=topic, subject=subject)
        except Exception as exc:  # noqa: BLE001 - transport problem, not quota
            print(f"FATAL: retrieval failed for {subject} / {topic}: {exc}")
            return 1
        contexts[(subject, topic)] = chunks
        print(f"  re-retrieved {len(chunks)} chunk(s) for {subject} / {topic}")

    cells = original["cells"]
    for cell in cells:
        cell["classified_as"] = None
        cell["aligned"] = None
        cell["scores"] = None
        stem_compliance(cell)

    ok_cells = [c for c in cells if c.get("status") == "ok" and c.get("question")]
    stop: dict[str, Any] | None = None
    judgements: list[dict] | None = None
    classify_error: str | None = None
    if ok_cells:
        if args.interval > 0:
            time.sleep(args.interval)
        print(f"  [judge] batched level + quality judgement of "
              f"{len(ok_cells)} question(s) in ONE call ... ", end="", flush=True)
        t0 = time.monotonic()
        try:
            judgements = judge_batched(ok_cells, chain, contexts)
            _apply_judgements(ok_cells, judgements)
            print(f"ok ({time.monotonic() - t0:.1f}s)")
        except (LLMQuotaExhaustedError, LLMUnavailableError) as exc:
            stop = {"reason": "quota" if isinstance(exc, LLMQuotaExhaustedError)
                    else "unavailable", "stage": "classification", "index": None}
            classify_error = f"{type(exc).__name__}: {getattr(exc, 'code', '?')}"
            print(f"STOP ({classify_error})")
        except Exception as exc:  # noqa: BLE001
            classify_error = f"{type(exc).__name__}: {str(exc)[:200]}"
            print(f"failed ({classify_error})")

    finished = datetime.now(timezone.utc)
    overall, by_level = build_summaries(cells)
    confusion: dict[str, dict[str, int]] = {}
    for cell in ok_cells:
        req = cell["bloom_requested"]
        got = cell.get("classified_as") or "(not judged)"
        confusion.setdefault(req, {})
        confusion[req][got] = confusion[req].get(got, 0) + 1

    report = {
        "report_version": REPORT_VERSION,
        "mode": "rescore",
        "label": args.label,
        "rescored_from": str(source),
        "started_at": rescore_started.isoformat(),
        "original_finished_at": original.get("finished_at"),
        "finished_at": finished.isoformat(),
        "duration_seconds": round((finished - rescore_started).total_seconds(), 1),
        "config": _masked_config(chain or [settings.llm_model], args.interval, args),
        "grid": original.get("grid"),
        "stop": stop,
        "classification": {
            "ok": judgements is not None,
            "count": len(judgements or []),
            "error": classify_error,
        },
        "cells": cells,
        "summary": {
            "generated_ok": overall["n_ok"],
            "llm_calls": 1,
            "aligned": overall["level_matched"],
            "alignment_pct": overall["level_match_pct"],
            "verb_compliant": overall["verb_compliant"],
            "verb_compliance_pct": overall["verb_compliance_pct"],
            "scores": overall["scores"],
            "by_level": by_level,
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
    _write_report(output, report, args.label)

    print("\n  re-scored with the SAME judge as AFTER runs:")
    print_tables(overall, by_level)
    if stop:
        print(f"  STOPPED ({stop['reason']}) — partial re-score written; NOT retrying.")
    return _stop_exit(stop, classify_error if judgements is None else None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Bloom alignment + quality audit (18 + 1 LLM calls)"
    )
    parser.add_argument("--label", required=True,
                        help="run label (also names the output file)")
    parser.add_argument("--output", default=None,
                        help="report path (default: /tmp/bloom_audit_<label>.json)")
    parser.add_argument("--topics", "--topic", action="append", default=None,
                        help="Subject/Topic to audit (repeatable; default: the 3 "
                             "demo topics) — point it at a real uploaded document "
                             "topic for e.g. the AFTER comparison")
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
    parser.add_argument("--rescore", default=None, metavar="REPORT_JSON",
                        help="re-judge the questions inside an existing report "
                             "(1 LLM call, no generation); writes "
                             "/tmp/bloom_audit_<label>_judged.json")
    args = parser.parse_args(argv)
    if args.rescore:
        return rescore(args)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
