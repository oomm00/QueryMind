"""
Topic-match evaluator — calibrate TOPIC_MATCH_K and TOPIC_MATCH_T
=================================================================
Generation V2 Step 1 measures the semantic topic-coverage rule:

    covered(topic) :=  at least K retrieved chunks score >= T   (cosine similarity)

on two corpora that both live in the shared ``querymind_documents`` collection:

  real  - every source_doc that was genuinely uploaded, including ``Unit 3.pdf``
          (the real multi-page document, 16 chunks, filed OS / Deadlock).
  demo  - the small demo chunks (seed_test_chunks.py) plus the demo_data docs.

For each labeled probe it runs a *semantic* search (no topic filter, i.e. the
subject=None fallback path retrieve_context uses) per tier, prints the top
scores, and reports precision/recall of the coverage rule over a (K, T) grid.

Labels (required probes — the grid counts these):
  cover:    "Deadlock", "Deadlocks", "dead lock", "Transactions"
  reject:   "Redis", "Cloud Computing", "React hooks", "Photosynthesis"
            (all absent from both corpora)
Report-only probe (measured, never part of the grid):
  "Deadlokc" — a typo of "Deadlocks"; embeddings place it ~0.18-0.20, so it
  cannot be separated from "Redis" (~0.15) by any safe threshold. Reported so
  the limitation is visible rather than hidden.

The subject-qualified variant ("<subject> <topic>" with a subject filter) is
printed as supporting evidence for the default generate path.

Usage (host run against the docker Chroma):
    python scripts/topic_match_eval.py [--chroma-host localhost] [--chroma-port 8001]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
SCRIPTS_DIR = Path(__file__).resolve().parent
for p in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

import chromadb  # noqa: E402
from chromadb.config import Settings as ChromaSettings  # noqa: E402

from seed_test_chunks import CHUNKS_DATA  # noqa: E402

COLLECTION_NAME = "querymind_documents"
DEMO_DATA_DOCS = {
    "OS__Deadlocks.md",
    "DBMS__Transactions.md",
    "Algorithms__Dynamic_Programming.md",
}
SEED_DOCS = {item["metadata"]["source_doc"] for item in CHUNKS_DATA}
DEMO_DOCS = SEED_DOCS | DEMO_DATA_DOCS

#: (query, subject or None when free/unknown, expected coverage, counted in grid)
QUERIES = [
    ("Deadlock", "OS", True, True),
    ("Deadlocks", "OS", True, True),
    ("dead lock", "OS", True, True),
    ("Transactions", "DBMS", True, True),
    ("Redis", None, False, True),
    ("Cloud Computing", None, False, True),
    ("React hooks", None, False, True),
    ("Photosynthesis", None, False, True),
    ("Deadlokc", "OS", True, False),  # typo — report-only, see module docstring
]
T_GRID = [round(0.25 + 0.05 * i, 2) for i in range(9)]  # 0.25 .. 0.65
K_GRID = (1, 2, 3)


def _scores(collection, query_texts, where, n_results):
    """Cosine similarities (1 - distance) for one semantic query, desc."""
    res = collection.query(
        query_texts=query_texts,
        n_results=n_results,
        where=where,
        include=["distances"],
    )
    distances = res.get("distances", [[]])[0] or []
    sims = [round(max(0.0, 1.0 - d), 4) for d in distances]
    sims.sort(reverse=True)
    return sims


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chroma-host", default="localhost")
    parser.add_argument("--chroma-port", type=int, default=8001)
    args, _unknown = parser.parse_known_args()  # tolerate trailing --debug

    client = chromadb.HttpClient(
        host=args.chroma_host,
        port=args.chroma_port,
        settings=ChromaSettings(anonymized_telemetry=False),
    )
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )
    total = collection.count()
    n_results = max(1, min(35, total))

    all_meta = collection.get(include=["metadatas"])["metadatas"]
    docs_by_tier: dict[str, dict[str, set]] = {
        "real": {"college": set(), "public": set()},
        "demo": {"college": set(), "public": set()},
    }
    for m in all_meta:
        corpus = "demo" if m.get("source_doc") in DEMO_DOCS else "real"
        docs_by_tier[corpus][m.get("source_type", "college")].add(m["source_doc"])

    print(f"collection={total} chunks  n_results={n_results}")
    for corpus in ("real", "demo"):
        c = docs_by_tier[corpus]
        print(f"  {corpus:4s}: college={len(c['college'])} docs, public={len(c['public'])} docs")

    # ── score capture: corpus x query x tier, both query modes ────────────────
    # mode "topic"  = query_text only, no subject filter (subject=None fallback)
    # mode "subj"   = "<subject> <topic>" with a subject filter (default path)
    results: dict[tuple, list[float]] = {}
    for corpus in ("real", "demo"):
        for query, subject, _expected, _required in QUERIES:
            for tier in ("college", "public"):
                docs = sorted(docs_by_tier[corpus][tier])
                base = (
                    [{"source_doc": {"$in": docs}}, {"source_type": tier}]
                    if docs
                    else None
                )
                if base is None:
                    results[(corpus, query, tier, "topic")] = []
                    results[(corpus, query, tier, "subj")] = []
                    continue
                results[(corpus, query, tier, "topic")] = _scores(
                    collection, [query], {"$and": base}, n_results
                )
                if subject:
                    results[(corpus, query, tier, "subj")] = _scores(
                        collection,
                        [f"{subject} {query}"],
                        {"$and": base + [{"subject": subject}]},
                        n_results,
                    )
                else:
                    results[(corpus, query, tier, "subj")] = []

    # ── coverage decision (mirrors retrieve_context's rule) ───────────────────
    def covered(corpus, query, k, t, mode):
        for tier in ("college", "public"):
            hits = sum(1 for s in results[(corpus, query, tier, mode)] if s >= t)
            if hits >= k:
                return True
        return False

    if "--debug" in sys.argv:
        print("-- decisions at K=1, T=0.35 --")
        for corpus in ("real", "demo"):
            for query, _s, expected, _r in QUERIES:
                got = covered(corpus, query, 1, 0.35, "topic")
                print(f"  {corpus} {query}: covered={got} expected={expected}")

    # ── per-query score table (primary mode) ──────────────────────────────────
    print("\n-- top scores, topic-only mode (c=college, p=public; '-' = tier empty) --")
    for corpus in ("real", "demo"):
        for query, _subject, expected, required in QUERIES:
            cols = []
            for tier in ("college", "public"):
                s = results[(corpus, query, tier, "topic")]
                cols.append(
                    f"{tier[0]}:" + (" ".join(f"{x:.3f}" for x in s[:5]) if s else "-")
                )
            tag = "yes" if expected else "no "
            note = "" if required else "   [report-only]"
            print(f"  {corpus:4s} {query:15s} exp={tag}{note}  " + "  ".join(cols))

    # ── K=1 separation margins (drive the T default) ──────────────────────────
    required = [q for q in QUERIES if q[3]]
    print("\n-- K=1 separation margins, topic-only top scores --")
    for corpus in ("real", "demo"):
        pos = [
            max(results[(corpus, q[0], t, "topic")] + [0.0])
            for q in required
            if q[2]
            for t in ("college", "public")
        ]
        neg = [
            max(results[(corpus, q[0], t, "topic")] + [0.0])
            for q in required
            if not q[2]
            for t in ("college", "public")
        ]
        typo = max(
            max(results[(corpus, "Deadlokc", t, "topic")] + [0.0])
            for t in ("college", "public")
        )
        print(
            f"  {corpus:4s} weakest positive={min(pos):.4f}  "
            f"strongest negative={max(neg):.4f}  typo={typo:.4f}"
        )

    # ── grid: covered := count(score >= T) >= K, per tier then OR across tiers ─
    print(f"\n-- grid (correct labels out of {len(required)}, topic-only mode) --")
    perfect_both: list[tuple[int, float]] = []
    for k in K_GRID:
        cells = []
        for t in T_GRID:
            counts = []
            for corpus in ("real", "demo"):
                ok = sum(
                    1
                    for q, _s, expected, _r in required
                    if covered(corpus, q, k, t, "topic") == expected
                )
                counts.append(ok)
            cells.append(f"{t:.2f}:{counts[0]}/{counts[1]}")
            if counts == [len(required), len(required)]:
                perfect_both.append((k, t))
        print(f"  K={k}  " + "  ".join(cells))

    print("\n-- subject-qualified top scores (supporting) --")
    for corpus in ("real", "demo"):
        for query, subject, _expected, _required in QUERIES:
            if not subject:
                continue
            s = results[(corpus, query, "college", "subj")]
            print(
                f"  {corpus:4s} {query:15s} "
                + (" ".join(f"{x:.3f}" for x in s[:5]) if s else "-")
            )

    if perfect_both:
        best_t = max(t for _k, t in perfect_both)
        rec = [(k, t) for k, t in perfect_both if t == best_t]
        print(f"\nperfect on both corpora (required probes): {perfect_both}")
        print(f"candidates at highest T={best_t}: {rec}")
    else:
        print("\nNO (K,T) is perfect on both corpora — inspect tables above")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
