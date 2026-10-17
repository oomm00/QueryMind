"""
Seed Script — Make a Fresh Stack Demo-Ready
===========================================
Registers a demo learner and uploads every document in ``demo_data/`` **through
the public HTTP API**, so a freshly started stack has real course material for
question generation to ground on.

One command turns an empty stack into a demo-ready one::

    python scripts/seed_demo.py

Documents are named ``<Subject>__<Topic>.<ext>`` — the double underscore
separates subject from topic, and underscores inside either part become spaces::

    demo_data/OS__Deadlocks.md                  -> subject "OS",   topic "Deadlocks"
    demo_data/Algorithms__Dynamic_Programming.md -> subject "Algorithms",
                                                    topic "Dynamic Programming"

Supported extensions: ``.md`` ``.txt`` ``.pdf`` ``.docx``.

Options::

    --base-url   API root                  (default: $QUERYMIND_API_URL or http://localhost:8000)
    --data-dir   folder of documents       (default: <repo>/demo_data)
    --email      demo account to create    (default: demo@querymind.local)
    --password   demo account password     (default: demo-password-1)
    --source-type  college | public        (default: college)
    --course     optional course label     (e.g. CSE302)

Re-running is safe: uploads upsert by content, and an existing demo account is
simply logged into.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

# Repo root is the parent of this script's folder (scripts/ -> repo/).
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = REPO_ROOT / "demo_data"

SUPPORTED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx"}
CONTENT_TYPES = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

DEFAULT_EMAIL = "demo@querymind.local"
DEFAULT_PASSWORD = "demo-password-1"


def parse_subject_topic(path: Path) -> tuple[str, str]:
    """Derive ``(subject, topic)`` from a ``<Subject>__<Topic>.<ext>`` filename."""
    stem = path.stem
    if "__" in stem:
        subject, topic = stem.split("__", 1)
    else:
        # No separator: treat the whole name as the topic under a generic subject.
        subject, topic = "General", stem
    return subject.replace("_", " ").strip(), topic.replace("_", " ").strip()


def _obtain_token(client: httpx.Client, email: str, password: str) -> str:
    """Register the demo account, or log in if it already exists."""
    register = client.post("/auth/register", json={"email": email, "password": password})
    if register.status_code in (200, 201):
        print(f"  registered demo account {email}")
        return register.json()["access_token"]

    # Already registered (409) or otherwise rejected -> try to log in.
    login = client.post("/auth/login", json={"email": email, "password": password})
    if login.status_code == 200:
        print(f"  logged in as existing demo account {email}")
        return login.json()["access_token"]

    raise SystemExit(
        f"Could not register or log in as {email}.\n"
        f"  register -> HTTP {register.status_code}: {register.text[:200]}\n"
        f"  login    -> HTTP {login.status_code}: {login.text[:200]}"
    )


def seed(base_url: str, data_dir: Path, email: str, password: str,
         source_type: str, course: str | None) -> int:
    documents = sorted(
        p for p in data_dir.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not documents:
        print(f"No documents found in {data_dir}. "
              f"Add files named <Subject>__<Topic>.md and re-run.")
        return 1

    print(f"Seeding {len(documents)} document(s) from {data_dir} -> {base_url}")

    with httpx.Client(base_url=base_url, timeout=120.0) as client:
        try:
            health = client.get("/health")
            health.raise_for_status()
        except Exception as exc:  # noqa: BLE001 - report any connectivity failure clearly
            raise SystemExit(
                f"Cannot reach the API at {base_url}/health ({exc}). "
                f"Is the stack running? Try: docker compose up -d --build"
            )

        token = _obtain_token(client, email, password)
        headers = {"Authorization": f"Bearer {token}"}

        failures = 0
        for path in documents:
            subject, topic = parse_subject_topic(path)
            content_type = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
            with path.open("rb") as fh:
                response = client.post(
                    "/documents/upload",
                    headers=headers,
                    files={"file": (path.name, fh, content_type)},
                    data={"subject": subject, "topic": topic,
                          "source_type": source_type, **({"course": course} if course else {})},
                )
            if response.status_code == 200:
                body = response.json()
                chunks = body.get("chunks_ingested") or body.get("chunks_count") or 0
                print(f"  [ok]   {path.name:42s} -> {subject} / {topic}  ({chunks} chunks)")
            else:
                failures += 1
                print(f"  [FAIL] {path.name:42s} -> HTTP {response.status_code}: "
                      f"{response.text[:200]}")

    if failures:
        print(f"\nDone with {failures} failure(s).")
        return 1
    print(f"\nDone. {len(documents)} document(s) uploaded — the stack is demo-ready.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--base-url",
                        default=os.getenv("QUERYMIND_API_URL", "http://localhost:8000"),
                        help="API root (default: $QUERYMIND_API_URL or http://localhost:8000)")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR),
                        help="folder of demo documents (default: <repo>/demo_data)")
    parser.add_argument("--email", default=os.getenv("DEMO_EMAIL", DEFAULT_EMAIL),
                        help=f"demo account email (default: {DEFAULT_EMAIL})")
    parser.add_argument("--password", default=os.getenv("DEMO_PASSWORD", DEFAULT_PASSWORD),
                        help="demo account password")
    parser.add_argument("--source-type", default="college", choices=["college", "public"],
                        help="material tier stored with each document (default: college)")
    parser.add_argument("--course", default=None, help="optional course label, e.g. CSE302")
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir)
    if not data_dir.is_dir():
        raise SystemExit(f"Data directory not found: {data_dir}")

    return seed(args.base_url, data_dir, args.email, args.password,
                args.source_type, args.course)


if __name__ == "__main__":
    sys.exit(main())
