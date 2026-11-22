"""Build the real-answer calibration corpus for the provisional evaluator.

Every bank question gets three paraphrased correct answers and three
plausible-but-wrong answers that stay on the same topic but assert the wrong
claim. The generated JSON is committed so the calibration is reproducible.
"""

from __future__ import annotations

import json
from pathlib import Path

BANK = Path(__file__).resolve().parents[1] / "app" / "data" / "demo_question_bank.json"
OUT = Path(__file__).resolve().parents[1] / "tests" / "data" / "provisional_answer_sets.json"

# concept -> (paraphrased correct answers, plausible-but-wrong answers)
CONCEPTS: dict[str, tuple[list[str], list[str]]] = {
    # ── Deadlocks ────────────────────────────────────────────────────────────
    "mutual exclusion": (
        [
            "Just one process can own a given resource at any moment.",
            "A resource is exclusive: only a single process may be using it at once.",
            "At any instant, one process at most has the resource; tehre is no sharing.",
        ],
        [
            "Deadlocks are avoided by letting every process use the resource at the same time.",
            "Mutual exclusion means all processes release their resources before requesting new ones.",
            "In a deadlock, the scheduler always grants the resource to the longest waiting process.",
        ],
    ),
    "hold and wait": (
        [
            "A process keeps what it already has while it asks for additional resources.",
            "The process does not release held resources before making more requests.",
            "It retains allocated resources and then requests extra ones.",
        ],
        [
            "A process must release all held resources before it asks for any more.",
            "Hold and wait means the OS preempts resources from whichever process has waited longest.",
            "The system grants every request immediately and ignores current holdings.",
        ],
    ),
    "no preemption": (
        [
            "The system cannot take a resource away until its holder gives it up.",
            "Resources are not forcibly removed; the owning process must release them.",
            "Preemption is disallowed, so an allocated resource stays with its process.",
        ],
        [
            "No preemption means the OS can reclaim any resource at any time.",
            "The scheduler forcibly removes resources from the oldest process first.",
            "Resources are released automatically when another process asks for them.",
        ],
    ),
    "circular wait": (
        [
            "There is a loop: each process waits for a resource held by the next.",
            "Processes form a wait cycle, with every member waiting on another.",
            "A chain of processes closes into a ring of dependencies.",
        ],
        [
            "Circular wait means every process waits for the CPU but not for resources.",
            "The processes are arranged in a straight line, not a cycle.",
            "Circular wait is resolved by giving each process every resource immediately.",
        ],
    ),
    "resource allocation graph": (
        [
            "It is a directed graph showing which process holds which resource.",
            "Nodes represent processes and resources, and arrows show allocations.",
            "A diagram with arrows from resources to processes and requests back.",
        ],
        [
            "A resource allocation graph is a bar chart of average CPU burst lengths.",
            "It records only process names and ignores all resource assignments.",
            "The graph plots memory usage against time and has no edges.",
        ],
    ),
    "safe state": (
        [
            "A state is safe when there is at least one order in which all processes finish.",
            "There exists a sequence of completions that lets every process complete.",
            "The system can still arrange the remaining work so nobody gets stuck.",
        ],
        [
            "A safe state is one where no process may ever request another resource.",
            "It means every process has already finished and the system is idle.",
            "The system is safe only when all resources are assigned to one process.",
        ],
    ),
    "deadlock detection": (
        [
            "The system regularly examines the graph to see whether a cycle exists.",
            "Detection runs from time to time and looks for circular dependencies.",
            "It scans allocations repeatedly to find a deadlock cycle.",
        ],
        [
            "Deadlock detection prevents deadlocks by refusing every new request.",
            "It checks CPU temperature once per second.",
            "Detection rolls back all processes without inspecting the graph.",
        ],
    ),
    "recovery by rollback": (
        [
            "The system sends one process back to an earlier state to resolve the deadlock.",
            "Recovery undoes a process's recent work so the cycle is broken.",
            "A victim process is rolled back until the deadlock disappears.",
        ],
        [
            "Recovery by rollback gives every process a new resource instead of undoing work.",
            "It restarts the entire machine without choosing a victim.",
            "Rollback means deleting all deadlock detection records.",
        ],
    ),
    # ── Transactions ─────────────────────────────────────────────────────────
    "atomicity": (
        [
            "A transaction is all-or-nothing: it finishes fully or is undone fully.",
            "Either every operation in the transaction succeeds, or none of them do.",
            "The database applies the whole transaction or reverts the whole thing.",
        ],
        [
            "Atomicity means a transaction may commit some of its operations and skip others.",
            "Transactions are split into smaller independent updates that each commit separately.",
            "Atomicity guarantees a transaction always commits, even if it fails.",
        ],
    ),
    "consistency": (
        [
            "A committed transaction leaves the database in a valid state and keeps its rules.",
            "The data still satisfies all invariants after the transaction finishes.",
            "It preserves the database's correctness rules from before to after.",
        ],
        [
            "Consistency means every transaction reads the same value twice.",
            "It requires all tables to have identical numbers of rows.",
            "Consistency lets a transaction violate rules as long as it commits quickly.",
        ],
    ),
    "isolation": (
        [
            "Transactions running at the same time cannot observe each other's uncommitted changes.",
            "Each transaction appears to run on its own, despite concurrency.",
            "Partial work from one transaction is hidden from other transactions.",
        ],
        [
            "Isolation means transactions must run one after another, never concurrently.",
            "It allows every transaction to read uncommitted writes from others.",
            "Isolation deletes data written by competing transactions.",
        ],
    ),
    "durability": (
        [
            "Once committed, changes are not lost if the system crashes.",
            "A committed update remains after a restart or power failure.",
            "The database keeps committed results even when hardware fails.",
        ],
        [
            "Durability means committed changes are erased after a crash for safety.",
            "It guarantees no data is ever written to disk.",
            "Durability requires the database to shut down after every commit.",
        ],
    ),
    "two-phase locking": (
        [
            "First the transaction only acquires locks, then it only releases them.",
            "Locks grow during one phase and shrink during a later phase.",
            "The transaction has an acquiring stage followed by a releasing stage.",
        ],
        [
            "Two-phase locking takes all locks and releases them at the same instant.",
            "It alternates acquiring and releasing every second.",
            "Two-phase locking is a rule about transaction names, not locks.",
        ],
    ),
    "write-ahead logging": (
        [
            "The log is forced to disk before the changed pages reach disk.",
            "Records go to the log first; data page writes happen afterwards.",
            "Before writing a page, the database makes sure the log record is durable.",
        ],
        [
            "Write-ahead logging writes data pages before any log record.",
            "It stores logs only after the transaction has committed and the page is written.",
            "The log is kept in memory and never flushed to disk.",
        ],
    ),
    "serializability": (
        [
            "The concurrent execution produces the same result as running transactions one at a time.",
            "Even with overlap, the outcome matches some serial ordering.",
            "A schedule is serializable when it behaves like a non-overlapping one.",
        ],
        [
            "Serializability requires all transactions to use the same table.",
            "It means every transaction must be one statement long.",
            "The schedule is serializable only if no transaction ever commits.",
        ],
    ),
    "savepoint": (
        [
            "It is a marker in a transaction that you can undo back to.",
            "A savepoint lets you roll back part of a transaction, not all of it.",
            "You can name a point and later revert changes made after that point.",
        ],
        [
            "A savepoint commits the transaction immediately.",
            "It is a backup of the whole database stored offsite.",
            "Savepoints can only be used after a transaction has ended.",
        ],
    ),
    # ── CPU Scheduling ───────────────────────────────────────────────────────
    "fcfs": (
        [
            "Jobs run in the order they arrive, first come first served.",
            "The process that arrived earliest is selected next.",
            "The scheduler uses arrival time and does not reorder the queue.",
        ],
        [
            "FCFS always runs the shortest job first.",
            "It gives each process a fixed time slice in a round.",
            "FCFS chooses the process with the highest priority regardless of arrival.",
        ],
    ),
    "sjf": (
        [
            "The next process chosen is the one with the briefest CPU burst.",
            "Short jobs are preferred over longer ones.",
            "The scheduler estimates burst length and takes the smallest.",
        ],
        [
            "SJF selects the process that has waited the longest.",
            "It always gives every process the same time quantum.",
            "SJF runs the largest job first to reduce context switches.",
        ],
    ),
    "round robin": (
        [
            "Processes take turns, each receiving the same fixed slice of CPU time.",
            "The ready list is circular and every process gets a quantum before repeating.",
            "A timer interrupts a process after its fixed slice and the next one runs.",
        ],
        [
            "Round robin lets one process run until it finishes, without a timer.",
            "It selects only the process with the shortest burst each time.",
            "Round robin assigns priorities based on memory size.",
        ],
    ),
    "time quantum": (
        [
            "It is the fixed maximum amount of CPU time one process gets before being switched.",
            "A quantum is the time slice allowed in one turn.",
            "The scheduler gives a process this slice before moving to the next.",
        ],
        [
            "The time quantum is the total time a process needs to finish.",
            "It is the amount of memory reserved for a process.",
            "Time quantum is the delay before a process arrives.",
        ],
    ),
    "preemption": (
        [
            "The scheduler can interrupt a running job and give the CPU to another.",
            "A running process may lose the CPU before it finishes.",
            "The OS can switch away from a process without waiting for it to end.",
        ],
        [
            "Preemption means a process keeps the CPU until it voluntarily finishes.",
            "It increases the priority of long-waiting jobs gradually.",
            "Preemption is when two processes share the same address space.",
        ],
    ),
    "starvation": (
        [
            "A job can wait forever because other jobs are always chosen instead.",
            "The process never gets CPU time as other work keeps taking priority.",
            "Indefinite postponement happens when a process is continually overlooked.",
        ],
        [
            "Starvation happens when two processes deadlock on the same resource.",
            "It means every process gets an exactly equal share of CPU time.",
            "Starvation ends a process immediately when it arrives.",
        ],
    ),
    "aging": (
        [
            "The scheduler slowly increases a waiting job's priority as time passes.",
            "Long-waiting processes are promoted step by step.",
            "A process's priority is boosted the longer it has been waiting.",
        ],
        [
            "Aging lowers the priority of processes that have waited the longest.",
            "It assigns priorities randomly on every context switch.",
            "Aging deletes processes that have waited too long.",
        ],
    ),
    "turnaround time": (
        [
            "It is the total time from when a process is submitted until it finishes.",
            "Turnaround measures arrival-to-completion, including all waiting.",
            "The elapsed time between job submission and job completion.",
        ],
        [
            "Turnaround time is only the time spent waiting in the ready queue.",
            "It measures the time from process creation to its first CPU burst.",
            "Turnaround time is the length of one time quantum.",
        ],
    ),
}


def concept_for(row: dict) -> str:
    # The question names the concept. The reference body can mention other
    # concepts (round robin's definition contains "time quantum"), so never
    # infer the concept from the whole reference.
    question = row["question"].lower()
    matches = [key for key in CONCEPTS if key in question]
    if matches:
        # "no preemption" also contains "preemption"; the longest phrase wins.
        return max(matches, key=len)

    label = row["correct_answer"].lower()
    for marker in ("means", "gives", "("):
        if marker in label:
            label = label.split(marker, 1)[0]
            break
    if ":" in label:
        label = label.split(":", 1)[0]
    matches = [key for key in CONCEPTS if key in label]
    if not matches:
        raise ValueError(f"Cannot identify a concept for: {row['question']}")
    return max(matches, key=len)


def main() -> None:
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    corpus = []
    for row in bank:
        concept = concept_for(row)
        paraphrases, wrong = CONCEPTS[concept]
        corpus.append(
            {
                "question": row["question"],
                "topic": row["topic"],
                "bloom_level": row["bloom_level"],
                "concept": concept,
                "reference": row["correct_answer"],
                "paraphrased_correct": paraphrases,
                "plausible_wrong": wrong,
            }
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(corpus, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(corpus)} questions x 6 answers = {len(corpus) * 6} answers to {OUT}")


if __name__ == "__main__":
    main()
