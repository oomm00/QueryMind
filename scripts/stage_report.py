#!/usr/bin/env python
"""Summarise QueryMind ``stage_timing`` log lines into a before/after table.

Every QueryMind request emits exactly one structured log line:

    {"event": "stage_timing", "path": "/questions/generate",
     "stages": {"retrieve": 12.3, "generate": 4200.1, "validate": 260.0}, ...}

This script aggregates those lines per request class
(``/questions/generate`` -> ``[generate]``, ``*/submit-answer`` -> ``[submit]``)
and prints avg / max / n per stage, so a pre-optimisation server log can be
compared with an optimised one.

Usage
-----
    python scripts/stage_report.py before=baseline_server.log after=after_server.log

Each argument is ``label=path`` and may be repeated. Results are printed as a
plain-text table on stdout.

Note: this is a developer/investigation helper — it is not imported by the
application and produces no artefacts. Perf harness JSON output
(``perf_result_*.json``) is git-ignored; see the repo ``.gitignore``.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

STAGES = ["retrieve", "generate", "validate", "evaluate"]


def parse(path: Path):
    gen = defaultdict(list)
    sub = defaultdict(list)
    total = defaultdict(list)
    n_lines = 0
    for line in path.read_text(errors="replace").splitlines():
        line = line.strip()
        if '"stage_timing"' not in line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if obj.get("event") != "stage_timing":
            continue
        n_lines += 1
        stages = obj.get("stages") or {}
        for k, v in stages.items():
            total[k].append(v)
        if obj.get("path") == "/questions/generate":
            for k, v in stages.items():
                gen[k].append(v)
        elif str(obj.get("path", "")).startswith("/questions/") and str(obj.get("path", "")).endswith("/submit-answer"):
            for k, v in stages.items():
                sub[k].append(v)
    return gen, sub, total, n_lines


def fmt(d):
    out = {}
    for k in STAGES:
        if d.get(k):
            out[k] = {
                "avg": round(statistics.mean(d[k]), 1),
                "max": round(max(d[k]), 1),
                "n": len(d[k]),
            }
    return out


def main():
    pairs = []
    for arg in sys.argv[1:]:
        label, _, path = arg.partition("=")
        pairs.append((label, Path(path)))

    rows = []
    for label, path in pairs:
        if not path.exists():
            rows.append((label, {"error": "missing"}, {}, 0))
            continue
        gen, sub, total, n = parse(path)
        rows.append((label, fmt(gen), fmt(sub), n))

    print(f"{'label':<28} {'reqs':>5}  stage        avg(ms)    max(ms)   n")
    print("-" * 74)
    for label, gen, sub, n in rows:
        print(f"{label:<28} {n:>5}  {'[generate]':<11}")
        for k in STAGES:
            if k in gen:
                print(f"{'':<28} {'':>5}  {k:<11} {gen[k]['avg']:>8} {gen[k]['max']:>10} {gen[k]['n']:>4}")
        print(f"{'':<28} {'':>5}  {'[submit]':<11}")
        for k in STAGES:
            if k in sub:
                print(f"{'':<28} {'':>5}  {k:<11} {sub[k]['avg']:>8} {sub[k]['max']:>10} {sub[k]['n']:>4}")


if __name__ == "__main__":
    main()
