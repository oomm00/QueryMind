# Database Systems — Transactions

A **transaction** is a sequence of operations that must be executed as a single
logical unit. Correct transaction processing guarantees the **ACID** properties:

- **Atomicity** — all operations commit, or none do.
- **Consistency** — the database moves from one valid state to another.
- **Isolation** — concurrent transactions do not observe each other's partial work.
- **Durability** — a committed transaction survives a crash.

## Concurrency control

**Two-Phase Locking (2PL)** prevents the classic anomalies by giving each
transaction a *growing* phase (acquiring locks) followed by a *shrinking* phase
(releasing locks). **Strict 2PL** holds every exclusive lock until commit or
abort, which guarantees recoverability and prevents cascading aborts and dirty
reads.

**Serializability** is the gold standard: a concurrent schedule is
*conflict-serializable* if it is equivalent to some serial schedule. A
**precedence graph** (serialization graph) is acyclic exactly when the schedule
is conflict-serializable.

## Isolation levels and MVCC

Standard SQL defines escalating isolation levels — Read Uncommitted, Read
Committed, Repeatable Read, and Serializable — which trade concurrency for
consistency by permitting progressively fewer anomalies.

**Multi-Version Concurrency Control (MVCC)** provides point-in-time snapshots so
that readers never block writers and writers never block readers: older tuple
versions are kept alive for transactions that still need them. **Write-Ahead
Logging (WAL)** underpins durability by writing changes to the log before dirty
pages reach the data files; **ARIES** recovery replays that log through analysis,
redo and undo phases.
