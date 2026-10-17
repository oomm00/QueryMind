# Operating Systems — Deadlocks

A **deadlock** is a state in which two or more processes are each waiting for a
resource that another process holds, so none of them can ever proceed. Four
conditions, known as the **Coffman conditions**, must all hold simultaneously for
a deadlock to be possible:

1. **Mutual exclusion** — at least one resource is held in a non-shareable mode.
2. **Hold and wait** — a process holds one resource while requesting another.
3. **No preemption** — a resource can only be released voluntarily by its holder.
4. **Circular wait** — a closed chain of processes each waits for a resource held
   by the next process in the chain.

Breaking *any one* of these conditions prevents deadlock entirely.

## Detection and recovery

A **resource-allocation graph** models processes, resources and the requests
between them. A cycle in the graph indicates a possible deadlock. Once detected,
the system can recover by aborting a victim process, rolling it back to a
checkpoint, or preempting a resource.

## Avoidance

**Deadlock avoidance** grants a resource request only if the system remains in a
**safe state** — an ordering in which every process can still run to completion.
The **Banker's algorithm** implements this: it simulates the allocation and
refuses any request that would leave the system unsafe.

## Prevention

Prevention attacks the conditions directly, for example by requiring processes to
request all resources up front (removing hold-and-wait) or by imposing a global
ordering on resources (removing circular wait). The **Dining Philosophers**
problem is the classic illustration: an asymmetric rule that makes one
philosopher pick up the right chopstick first breaks the circular wait.
