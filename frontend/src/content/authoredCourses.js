/**
 * Authored Course Data for QueryMind Catalog.
 *
 * Provides complete curriculum, lessons, concepts, and practice questions for:
 * 1. Database Management Systems (DBMS)
 * 2. Computer Networks (Networks)
 * 3. Data Structures & Algorithms (DSA)
 */

export const AUTHORED_COURSES = {
  'database-management-systems': {
    id: 'database-management-systems',
    contentId: 'dbms',
    title: 'Database Management Systems',
    subject: 'DBMS',
    summary: 'Relational modelling, SQL, indexing, transactions, and the trade-offs behind storage engines.',
    level: 'intermediate',
    topics: [
      {
        id: 'transactions-acid',
        title: 'Transactions & ACID Properties',
        subject: 'DBMS',
        summary: 'Atomicity, Consistency, Isolation, and Durability guarantees in multi-user concurrent databases.',
        concepts: [
          {
            id: 'acid-properties',
            title: 'ACID Guarantees & Concurrency',
            summary: 'The theoretical foundation ensuring database operations remain reliable and consistent.',
            questionCount: 3,
            resourceCount: 2,
            resources: [
              { title: 'Database Transaction Invariants', url: 'https://en.wikipedia.org/wiki/ACID', type: 'article' },
              { title: 'Isolation Levels in SQL Standard', url: 'https://en.wikipedia.org/wiki/Isolation_(database_systems)', type: 'reference' },
            ],
            lessonIds: ['lesson-acid-foundations'],
            lessons: [
              {
                id: 'lesson-acid-foundations',
                title: 'ACID Foundations & Concurrency Anomalies',
                blocks: [
                  {
                    type: 'markdown',
                    content: `### ACID Transactions in Database Systems

A transaction is a logical unit of database processing that includes one or more database access operations.

#### The Four Core Properties:
1. **Atomicity**: Either all operations of the transaction are reflected properly in the database, or none are (all-or-nothing). Enforced using Write-Ahead Logging (WAL).
2. **Consistency**: Execution of a transaction in isolation preserves database integrity constraints.
3. **Isolation**: Even though multiple transactions may execute concurrently, each transaction must be unaware of others executing concurrently.
4. **Durability**: After a transaction completes successfully, its changes persist even in the event of system crashes.`,
                  },
                ],
              },
            ],
            questions: [
              {
                question_id: 'dbms-acid-q1',
                question_text: 'State the mechanism databases primarily use to guarantee transaction Atomicity across unexpected system crashes.',
                type: 'open',
                correct_answer: 'Write-Ahead Logging (WAL) or undo logging',
                explanation: 'Write-ahead logging records all modifications to persistent log files before writing modified dirty pages to disk, allowing rollback of incomplete transactions upon crash recovery.',
                bloom_level: 'remember',
                difficulty: 'easy',
              },
              {
                question_id: 'dbms-acid-q2',
                question_text: 'Which isolation anomaly occurs when a transaction reads uncommitted changes written by another concurrent transaction that later aborts?',
                type: 'mcq',
                options: ['Dirty Read (Read Uncommitted)', 'Non-repeatable Read', 'Phantom Read', 'Lost Update'],
                correct_answer: 'Dirty Read (Read Uncommitted)',
                explanation: 'A dirty read occurs when Transaction A reads data modified by concurrent Transaction B before B has committed, reading uncommitted state that may be rolled back.',
                bloom_level: 'understand',
                difficulty: 'easy',
              },
              {
                question_id: 'dbms-acid-q3',
                question_text: 'Analyze the trade-off between Read Committed and Serializable isolation levels in a high-throughput transaction processing engine.',
                type: 'open',
                correct_answer: 'Serializable guarantees serial consistency and prevents all anomalies (dirty reads, non-repeatable reads, phantoms) but introduces lock contention or serialization failure retries. Read Committed delivers high concurrent throughput but permits non-repeatable and phantom reads.',
                explanation: 'Serializable eliminates all concurrent anomalies but requires strict multi-version concurrency validation or 2-phase locking, increasing latency and transaction abort rates compared to Read Committed.',
                bloom_level: 'analyze',
                difficulty: 'medium',
              },
            ],
          },
        ],
      },
      {
        id: 'indexing-b-trees',
        title: 'Indexing & B+ Trees',
        subject: 'DBMS',
        summary: 'Hierarchical tree storage structures, clustered indexes, and range search performance.',
        concepts: [
          {
            id: 'b-plus-trees',
            title: 'B+ Tree Structures & Range Queries',
            summary: 'High fanout search trees where all records live in leaf nodes linked as a contiguous sequence.',
            questionCount: 2,
            resourceCount: 1,
            resources: [
              { title: 'B+ Tree Storage Mechanics', url: 'https://en.wikipedia.org/wiki/B%2B_tree', type: 'article' },
            ],
            lessonIds: ['lesson-b-plus-trees'],
            lessons: [
              {
                id: 'lesson-b-plus-trees',
                title: 'B+ Trees in Storage Engines',
                blocks: [
                  {
                    type: 'markdown',
                    content: `### B+ Tree Architecture

B+ Trees are self-balancing search trees specifically optimized for systems that read and write large blocks of data.

#### Key Invariants:
- All data records are stored exclusively in leaf nodes.
- Internal nodes contain only routing keys and child pointers, maximizing fanout.
- Leaf nodes are linked sequentially as a doubly linked list for efficient range scans.
- Search, insertion, and deletion exhibit worst-case O(log N) disk I/O operations.`,
                  },
                ],
              },
            ],
            questions: [
              {
                question_id: 'dbms-btree-q1',
                question_text: 'State why B+ Trees are preferred over standard binary search trees (BST) for disk-based database indexes.',
                type: 'open',
                correct_answer: 'High fanout reduces tree height and minimizes expensive disk I/O operations.',
                explanation: 'Because disk seeks are orders of magnitude slower than memory reads, B+ Trees use a wide node size (typically matching disk page size, 4KB-16KB) to store hundreds of keys per node, keeping the tree height shallow (3 to 4 levels).',
                bloom_level: 'remember',
                difficulty: 'easy',
              },
              {
                question_id: 'dbms-btree-q2',
                question_text: 'Explain how the linked list structure connecting B+ Tree leaf nodes enables fast range scans (e.g. BETWEEN 10 AND 50).',
                type: 'open',
                correct_answer: 'The search locates the lower bound leaf node in O(log N), then follows leaf pointers sequentially without re-traversing internal nodes.',
                explanation: 'Once the search key is located at the leaf level, the engine traverses sequential sibling leaf pointers until the upper bound is exceeded, executing a linear scan over contiguous pages.',
                bloom_level: 'understand',
                difficulty: 'easy',
              },
            ],
          },
        ],
      },
    ],
  },

  'computer-networks': {
    id: 'computer-networks',
    contentId: 'networks',
    title: 'Computer Networks',
    subject: 'Computer Networks',
    summary: 'From packets and the OSI model to TCP congestion control, DNS, and how the internet reaches you.',
    level: 'intermediate',
    topics: [
      {
        id: 'tcp-congestion-control',
        title: 'TCP Congestion Control',
        subject: 'Computer Networks',
        summary: 'Additive Increase Multiplicative Decrease (AIMD), Slow Start, and window management.',
        concepts: [
          {
            id: 'tcp-congestion-mechanisms',
            title: 'Congestion Window & AIMD',
            summary: 'Feedback-driven flow and congestion control algorithms preventing network collapse.',
            questionCount: 3,
            resourceCount: 2,
            resources: [
              { title: 'RFC 5681: TCP Congestion Control', url: 'https://datatracker.ietf.org/doc/html/rfc5681', type: 'rfc' },
              { title: 'AIMD Dynamics in Transport Layer', url: 'https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease', type: 'article' },
            ],
            lessonIds: ['lesson-tcp-congestion'],
            lessons: [
              {
                id: 'lesson-tcp-congestion',
                title: 'TCP Congestion Control Algorithms',
                blocks: [
                  {
                    type: 'markdown',
                    content: `### TCP Congestion Control Framework

TCP regulates transmission rates using dynamic adjustment of the congestion window (CWND):

#### Four Intertwined Phases:
1. **Slow Start**: CWND begins at 1 MSS and doubles every RTT (exponential growth) until reaching \`ssthresh\`.
2. **Congestion Avoidance**: Once \`CWND >= ssthresh\`, CWND increases linearly by 1 MSS per RTT (Additive Increase).
3. **Fast Retransmit**: Upon receiving 3 duplicate ACKs, the missing segment is retransmitted immediately without waiting for a retransmission timer timeout.
4. **Fast Recovery**: \`ssthresh\` is halved (Multiplicative Decrease) and CWND is adjusted to avoid falling back to 1 MSS.`,
                  },
                ],
              },
            ],
            questions: [
              {
                question_id: 'net-tcp-q1',
                question_text: 'State the standard acronym for the control algorithm that combines linear growth of the congestion window with multiplicative halving upon packet loss.',
                type: 'open',
                correct_answer: 'AIMD (Additive Increase Multiplicative Decrease)',
                explanation: 'AIMD ensures fair bandwidth allocation and stability across competing network flows by increasing window linearly and cutting it exponentially upon packet loss signals.',
                bloom_level: 'remember',
                difficulty: 'easy',
              },
              {
                question_id: 'net-tcp-q2',
                question_text: 'How many duplicate ACKs trigger TCP Fast Retransmit before the retransmission timeout (RTO) expires?',
                type: 'mcq',
                options: ['3 duplicate ACKs (4 identical ACKs total)', '1 duplicate ACK', '2 duplicate ACKs', '5 duplicate ACKs'],
                correct_answer: '3 duplicate ACKs (4 identical ACKs total)',
                explanation: 'RFC 5681 defines receipt of 3 duplicate ACKs as strong evidence that a packet was lost rather than reordered, triggering Fast Retransmit.',
                bloom_level: 'understand',
                difficulty: 'easy',
              },
              {
                question_id: 'net-tcp-q3',
                question_text: 'Evaluate why TCP Vegas or BBR achieves higher throughput than traditional TCP Reno on high-bandwidth, high-latency satellite links.',
                type: 'open',
                correct_answer: 'BBR and Vegas measure packet delay and round-trip time variations instead of treating packet drops as the sole indicator of congestion, preventing premature window halving.',
                explanation: 'Loss-based congestion algorithms like Reno saturate buffer queues until drops occur, which degrades performance on high-delay links. Delay/bandwidth-based models maintain queues at bottleneck bandwidth capacity without inducing bufferbloat.',
                bloom_level: 'evaluate',
                difficulty: 'hard',
              },
            ],
          },
        ],
      },
    ],
  },

  'data-structures-algorithms': {
    id: 'data-structures-algorithms',
    contentId: 'dsa',
    title: 'Data Structures & Algorithms',
    subject: 'Data Structures & Algorithms',
    summary: 'Arrays, trees, graphs, dynamic programming, and complexity analysis.',
    level: 'beginner',
    topics: [
      {
        id: 'graph-algorithms',
        title: 'Graph Algorithms & Shortest Paths',
        subject: 'Data Structures & Algorithms',
        summary: 'Breadth-first search, depth-first search, Dijkstra, and minimum spanning trees.',
        concepts: [
          {
            id: 'dijkstra-algorithm',
            title: "Dijkstra's Shortest Path Algorithm",
            summary: 'Greedy single-source shortest path algorithm on non-negative weighted graphs.',
            questionCount: 3,
            resourceCount: 2,
            resources: [
              { title: "Dijkstra's Algorithm Overview", url: 'https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm', type: 'article' },
            ],
            lessonIds: ['lesson-dijkstra'],
            lessons: [
              {
                id: 'lesson-dijkstra',
                title: "Dijkstra's Algorithm and Relaxation Invariants",
                blocks: [
                  {
                    type: 'markdown',
                    content: `### Dijkstra's Shortest Path Algorithm

Given a directed or undirected graph with non-negative edge weights and a source vertex $S$:

#### Algorithm Mechanics:
1. Initialize distances $dist[v] = \\infty$, $dist[S] = 0$.
2. Maintain a min-priority queue of unvisited vertices ordered by $dist$.
3. Extract vertex $u$ with minimal $dist[u]$.
4. For each neighbor $v$ of $u$, perform edge relaxation:
   \`if dist[u] + weight(u, v) < dist[v]: dist[v] = dist[u] + weight(u, v)\`
5. Repeat until the priority queue is empty.

**Complexity**: $O((V + E) \\log V)$ using a binary heap, or $O(E + V \\log V)$ using a Fibonacci heap.`,
                  },
                ],
              },
            ],
            questions: [
              {
                question_id: 'dsa-dijkstra-q1',
                question_text: "State the primary reason why Dijkstra's algorithm fails to compute correct shortest paths on graphs containing negative edge weights.",
                type: 'open',
                correct_answer: 'Dijkstra assumes that once a vertex is visited and extracted from the priority queue, its computed distance is final and optimal, which is invalidated if negative edges can reduce path cost later.',
                explanation: "The greedy choice property relies on non-negative edge weights; negative edges require Bellman-Ford or Johnson's algorithm.",
                bloom_level: 'remember',
                difficulty: 'easy',
              },
              {
                question_id: 'dsa-dijkstra-q2',
                question_text: "What is the tightest asymptotic time complexity of Dijkstra's algorithm implemented with an adjacency list and binary min-heap?",
                type: 'mcq',
                options: ['O((V + E) log V)', 'O(V^2)', 'O(E + V log V)', 'O(V * E)'],
                correct_answer: 'O((V + E) log V)',
                explanation: 'Extracting V minimum vertices takes O(V log V) time, and relaxing E edges with decrease-key operations takes O(E log V) time, yielding O((V + E) log V).',
                bloom_level: 'understand',
                difficulty: 'easy',
              },
              {
                question_id: 'dsa-dijkstra-q3',
                question_text: "Analyze the structural differences between Dijkstra's algorithm and Prim's algorithm for Minimum Spanning Trees.",
                type: 'open',
                correct_answer: "Dijkstra computes path distance from a single source by accumulating total edge weights along paths (dist[u] + weight(u,v)), whereas Prim's algorithm tracks only the minimum edge weight connecting an unvisited vertex to the growing tree (weight(u,v)).",
                explanation: 'Both use a priority queue and greedy extraction, but Dijkstra minimizes cumulative path distance while Prim minimizes single cut edge weights.',
                bloom_level: 'analyze',
                difficulty: 'medium',
              },
            ],
          },
        ],
      },
    ],
  },
}

export function getAuthoredCourse(courseId) {
  if (!courseId) return null
  const course = AUTHORED_COURSES[courseId]
  if (!course) return null
  return {
    ...course,
    topics: course.topics.map((t) => ({
      ...t,
      lessons: t.lessons || t.concepts?.flatMap((c) => c.lessons || []) || [],
    })),
  }
}

export function allAuthoredCourseIds() {
  return Object.keys(AUTHORED_COURSES)
}
