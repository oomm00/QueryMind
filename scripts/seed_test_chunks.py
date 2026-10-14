"""
Seed Script — Seed ChromaDB with Realistic College & Public Chunks
==================================================================
Populates ChromaDB with sample chunks across DBMS, OS, and Algorithms.
Supports both running against an active Chroma HTTP server or local ephemeral/persistent store.

Usage:
    python scripts/seed_test_chunks.py
"""

from __future__ import annotations

import os
import sys

# Ensure backend directory is in python path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

import chromadb
from chromadb.config import Settings as ChromaSettings
from app.core.config import settings

CHUNKS_DATA = [
    # ── DBMS: Transactions (College) ──────────────────────────
    {
        "id": "dbms_col_1",
        "text": (
            "Transactions in DBMS must guarantee ACID properties: Atomicity, Consistency, "
            "Isolation, and Durability. Concurrency control uses Two-Phase Locking (2PL) "
            "to prevent dirty reads, non-repeatable reads, and write skew in concurrent executions."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "CSE302_DBMS_Lecture7_Transactions.pdf",
        },
    },
    {
        "id": "dbms_col_2",
        "text": (
            "Serializability is the gold standard for concurrency control. A concurrent schedule "
            "is conflict serializable if it is equivalent to a serial schedule by swapping non-conflicting "
            "instructions. Serialization graphs (precedence graphs) verify cycle-free conflict serializability."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "CSE302_DBMS_Midterm_Review.pdf",
        },
    },
    {
        "id": "dbms_col_3",
        "text": (
            "Strict Two-Phase Locking (Strict 2PL) guarantees recoverability and prevents cascading aborts. "
            "In Strict 2PL, a transaction cannot release any exclusive (write) locks until it has completely "
            "committed or aborted."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "CSE302_Lab_Manual_Locks.pdf",
        },
    },
    # ── DBMS: Transactions (Public) ───────────────────────────
    {
        "id": "dbms_pub_1",
        "text": (
            "Standard SQL isolation levels define the anomalies allowed during concurrent execution: "
            "Read Uncommitted (dirty reads permitted), Read Committed (non-repeatable reads permitted), "
            "Repeatable Read (phantom reads permitted), and Serializable (full isolation)."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "PostgreSQL_Documentation_Transactions.md",
        },
    },
    {
        "id": "dbms_pub_2",
        "text": (
            "Write-Ahead Logging (WAL) ensures database durability by appending modification logs to disk "
            "before dirty buffer pages are flushed to database tablespaces. ARIES recovery applies analysis, "
            "redo, and undo phases."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "Database_Internals_OReilly.txt",
        },
    },
    {
        "id": "dbms_pub_3",
        "text": (
            "Multi-Version Concurrency Control (MVCC) enables high concurrency by providing point-in-time "
            "consistent snapshots. Readers do not block writers and writers do not block readers because older "
            "tuple versions are preserved for active transactions."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "DBMS",
            "topic": "Transactions",
            "source_doc": "Wikipedia_MVCC_Overview.txt",
        },
    },
    # ── OS: Concurrency (College) ─────────────────────────────
    {
        "id": "os_col_1",
        "text": (
            "A critical section is a piece of code that accesses shared resources. Mutual exclusion "
            "guarantees that only one process can execute in its critical section at any given time, "
            "preventing race conditions."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "CS201_OS_Lecture9_Synchronization.pdf",
        },
    },
    {
        "id": "os_col_2",
        "text": (
            "Counting semaphores and binary semaphores (mutexes) provide wait() and signal() operations. "
            "Semaphores solve classic synchronization problems like Producer-Consumer and Readers-Writers."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "CS201_OS_Lab4_Semaphores.pdf",
        },
    },
    {
        "id": "os_col_3",
        "text": (
            "The Dining Philosophers problem illustrates deadlock and starvation where five philosophers "
            "compete for five chopsticks. An asymmetrical solution breaks circular wait by ordering pickup."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "CS201_OS_Past_Questions_2025.pdf",
        },
    },
    # ── OS: Concurrency (Public) ──────────────────────────────
    {
        "id": "os_pub_1",
        "text": (
            "Coffman conditions necessary for deadlock are: Mutual Exclusion, Hold and Wait, "
            "No Preemption, and Circular Wait. Breaking any one condition prevents system deadlock."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "Silberschatz_Operating_System_Concepts.txt",
        },
    },
    {
        "id": "os_pub_2",
        "text": (
            "Peterson's solution is a classical algorithmic proof for mutual exclusion between two processes "
            "using shared variables flag and turn without specialized hardware primitives."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "GeeksforGeeks_Peterson_Algorithm.txt",
        },
    },
    {
        "id": "os_pub_3",
        "text": (
            "Kernel spinlocks utilize hardware compare-and-swap (CAS) instructions to busy-wait. "
            "They are suited only for short critical sections on multi-processor architectures."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "OS",
            "topic": "Concurrency",
            "source_doc": "Linux_Kernel_Development_Love.txt",
        },
    },
    # ── Algorithms: Dynamic Programming ───────────────────────
    {
        "id": "algo_col_1",
        "text": (
            "Dynamic Programming requires optimal substructure and overlapping subproblems. "
            "Top-down memoization stores recursive solutions while bottom-up tabulation builds the table iteratively."
        ),
        "metadata": {
            "source_type": "college",
            "subject": "Algorithms",
            "topic": "Dynamic Programming",
            "source_doc": "CS204_Algorithms_DP_Notes.pdf",
        },
    },
    {
        "id": "algo_pub_1",
        "text": (
            "The 0/1 Knapsack problem demonstrates 2D dynamic programming with recurrence "
            "dp[i][w] = max(dp[i-1][w], val[i-1] + dp[i-1][w-wt[i-1]]). Pseudo-polynomial time complexity is O(N*W)."
        ),
        "metadata": {
            "source_type": "public",
            "subject": "Algorithms",
            "topic": "Dynamic Programming",
            "source_doc": "CLRS_Introduction_to_Algorithms.txt",
        },
    },
]


def seed_chunks(client: chromadb.api.ClientAPI | None = None, collection_name: str = "querymind_documents"):
    """Inserts test chunks into ChromaDB collection."""
    if client is None:
        try:
            print(f"Connecting to ChromaDB at {settings.chroma_host}:{settings.chroma_port}...")
            client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
            # Ping client
            client.heartbeat()
            print("Connected to ChromaDB HTTP service successfully.")
        except Exception as e:
            print(f"Could not connect to ChromaDB HTTP service ({e}). Using persistent local client at ./chroma_data")
            client = chromadb.PersistentClient(path="./chroma_data")

    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    ids = [item["id"] for item in CHUNKS_DATA]
    documents = [item["text"] for item in CHUNKS_DATA]
    metadatas = [item["metadata"] for item in CHUNKS_DATA]

    print(f"Seeding {len(CHUNKS_DATA)} chunks into '{collection_name}'...")
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )
    print(f"Successfully seeded {collection.count()} total chunks into '{collection_name}'.")
    return collection


if __name__ == "__main__":
    seed_chunks()
