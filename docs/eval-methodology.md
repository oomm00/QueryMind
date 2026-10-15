# QueryMind Evaluation Methodology: Rubric-Based LLM-as-a-Judge

## 1. Overview & Evaluation Philosophy

In an academic and technical assessment system like **QueryMind**, grading student responses cannot be treated as a binary correct/incorrect matching problem. Free-text, descriptive, and conceptual answers exhibit high variance in phrasing, vocabulary, structure, and depth.

QueryMind implements an **LLM-as-a-Judge** architecture anchored by an explicit, five-dimensional weighted rubric. To guarantee mathematical reliability and fairness:
1. The judge model scores each criterion strictly as an integer between `0` and `10`.
2. The overall weighted score is **computed deterministically in code**—the model's internal arithmetic is never trusted.
3. Sub-scores are stored in PostgreSQL using a flexible **JSONB column (`criteria_scores`)**, allowing long-term rubric extensibility.
4. Each submission immediately triggers the **Adaptive Mastery Engine**, updating the student's continuous knowledge profile across topics and Bloom's cognitive taxonomy levels.

---

## 2. The 5-Criterion Weighted Rubric

Student answers are judged against the question's ground-truth reference answer and cognitive target (Bloom's taxonomy level) using the following weights:

| Criterion | Weight | Focus & Scoring Description |
|---|---|---|
| **Conceptual Correctness** | **35%** | Factual and conceptual accuracy compared with reference answer. Core mechanics and laws of the topic must be represented accurately without conceptual fallacies. |
| **Completeness** | **25%** | Thorough coverage of key theoretical points, mechanisms, assumptions, or prerequisites stated in the syllabus/lecture material. |
| **Technical Depth** | **20%** | Rigor of explanation judged against the question's cognitive Bloom level (e.g., plain recall receives low depth scores on *Analyze* or *Evaluate* questions). |
| **Example / Application** | **10%** | Demonstration of the concept through a concrete scenario, code snippet, counterexample, or real-world use case. |
| **Clarity & Expression** | **10%** | Coherent logical structure, precise technical vocabulary, and readability. |

### Mathematical Formulation

Each criterion $c_i \in [0, 10]$ is clamped in code:
$$\tilde{c}_i = \max(0, \min(10, \text{round}(c_i)))$$

The overall score $S \in [0, 100]$ is computed deterministically:
$$S = \sum_{i=1}^{5} w_i \cdot \tilde{c}_i \times 10$$
where $\sum_{i=1}^{5} w_i = 1.00$ ($0.35 + 0.25 + 0.20 + 0.10 + 0.10$).

---

## 3. Why LLM-as-a-Judge Was Chosen Over Keyword / N-Gram Matching

Traditional automated grading systems rely on keyword overlap, regex matching, or TF-IDF/n-gram similarity (e.g., BLEU, ROUGE). For higher-order academic evaluations, these approaches fail systematically:

### 1. Paraphrasing and Semantic Equivalence
- **Keyword Failure**: In computer science, a student might describe Strict Two-Phase Locking by writing: *"Locks on modified records remain active until the transaction finalizes or rolls back."* A keyword matcher looking for `"exclusive lock"` and `"commit phase"` marks this zero or penalizes it severely.
- **LLM Advantage**: Semantic reasoning understands that *"locks on modified records"* refers to exclusive write locks and *"finalizes"* maps to commit.

### 2. Resistance to "Keyword Stuffing" and Adversarial Phrasing
- **Keyword Failure**: An uninformed student can construct a nonsense sentence containing course buzzwords: *"ACID transactions use dirty reads and serializability to deadlock two-phase locking."* Pure keyword or embedding matchers yield high similarity scores despite the answer being conceptually nonsensical.
- **LLM Advantage**: The LLM judge evaluates logical coherence and factual veracity against the reference answer.

### 3. Depth-of-Reasoning Aligned with Bloom's Taxonomy
- A question at the **Analyze** level requires students to distinguish mechanisms (e.g., *Conflict Serializability* vs. *View Serializability*). Keyword matching cannot distinguish whether terms are merely defined in isolation or rigorously contrasted.

### 4. Actionable, Constructive Feedback
- String matchers only emit a scalar score.
- QueryMind's LLM judge returns structured feedback identifying **exact missing points** and **conceptual strengths**, providing students with actionable pedagogical guidance.

---

## 4. Prompt-Injection Hardening

Student answers are untrusted input. The judge prompt isolates the answer inside explicit delimiter boundaries (`<<<STUDENT_ANSWER ... STUDENT_ANSWER>>>`) and includes strict system instructions directing the judge to treat user input solely as academic data, ignoring any embedded instructions, prompt injection attempts, or score demands.

---

## 5. System Integration & Adaptive Loop

```
  [Student Answer]
         │
         ▼
  [LLM-as-a-Judge] ──► Generates per-criterion scores [0-10] + Feedback
         │
         ▼
  [Backend Code]   ──► Computes Overall Score (0-100)
         │
         ▼
  [Postgres DB]    ──► Stores Attempt: score (0.0-1.0), criteria_scores (JSONB)
         │
         ▼
[Adaptive Engine]  ──► update_mastery_profile(user_id, topic, bloom_level, score)
```

By persisting `criteria_scores` as a JSONB column, QueryMind maintains per-criterion historical trends (e.g., whether a student is consistently weak on *technical depth* versus *example application*) without requiring destructive database schema alterations.
