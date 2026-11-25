# QueryMind technical blueprint

> Verified against commit `c85de7d` on 2026-10-19. The working tree also contains
> unrelated uncommitted changes; this documentation describes the checked-out
> implementation and marks repository/dashboard gaps explicitly.

This is a source-grounded blueprint of QueryMind, an adaptive study application
with a React/Vite client, FastAPI API, PostgreSQL persistence, Chroma retrieval,
and Gemini generation/evaluation. Read the chapters in order for a tour from
product intent through deployment and testing.

## Reading order

| Chapter | Subject |
|---|---|
| 00 | Executive summary |
| 01 | Architecture and trust boundaries |
| 02 | Repository map |
| 03 | Pipeline |
| 04 | Request workflows |
| 05 | Backend internals |
| 06 | Retrieval/RAG |
| 07 | Ingestion |
| 08 | Question generation and Bloom control |
| 09 | Answer evaluation |
| 10 | Mastery and adaptation |
| 11 | Database design |
| 12 | Operating-systems mapping |
| 13 | API reference |
| 14 | Security |
| 15 | Reliability and performance |
| 16 | Configuration |
| 17 | Frontend |
| 18 | Deployment |
| 19 | Known issues and roadmap |
| 20 | Testing and quality |
| 21 | Appendices and viva questions |

The combined reading copy is [`QueryMind_Blueprint.md`](./QueryMind_Blueprint.md).
“Needs input from Om” means the fact is dashboard-only, unavailable in the
repository, or not safely inferable from code.

