# Product Model

QueryMind is an **assessment and practice platform**. Students answer questions,
get scored, and see what they actually know. Study material is optional support
for practice — it is never the product, and it never gates anything.

This document is the rulebook the frontend follows. Where the UI and this file
disagree, this file is right.

## 1. What the product is

- **Practice first.** The path through the app is course → topic → concept →
  question. Every overview screen leads with what can be practised.
- **Measured, not estimated.** Mastery comes from scored answers and nothing
  else. Progress through reading is *completion*, a separate number.
- **Content comes from files.** Every question and every resource is read from
  `frontend/src/content/**`. Nothing is generated in the client, and no URL is
  ever written in app code.
- **Honest empty states.** When there are no questions, no resources, or no
  scored answers, the app says so in words. It does not show a zero as if it
  were a measurement, and it does not link anywhere invented.

## 2. The objects

| object | is | notes |
| --- | --- | --- |
| course | a catalogue entry with topics | `operating-systems` (catalog) and `os` (content) both resolve |
| topic | a group of concepts | rows on the course overview |
| concept | the unit that is assessed | owns `questions[]` and optional `resources[]` |
| question | an `mcq` or a `short` | the practice bank, mixed across Bloom levels per session |
| resource | optional study material | at most 3 per concept, `https` only |
| lesson | optional written study notes | labelled "Study notes" in the UI |

Shapes and required fields live in [CONTENT_SCHEMA.md](./CONTENT_SCHEMA.md).

## 3. The student loop

1. **Start practice** from a concept (concept panel, mini map) or a topic (course
   overview, topic row).
2. A session is drawn from that concept's or topic's question bank, **mixed
   across Bloom levels** — a session is never all `remember`.
3. Every question is shown with a **"Course bank"** source badge, so a student
   knows the question came from authored content.
4. **MCQs are graded in the app**, immediately, from `correctIndex`.
5. **Short answers are self-marked while the app is mocked.** The app shows the
   `answerKey` and the rubric and the student marks each criterion — labelled
   **"Self-marked"**. It never pretends a model graded the answer. When the real
   backend is on, submission goes through the existing attempt endpoint via the
   adapter instead.
6. **Feedback** shows the score, the explanation, and a short list of study
   material for that concept.
7. The score updates mastery (see below). Nothing else does.

## 4. Mastery

Pure functions in `frontend/src/lib/mastery.js`; stored per user in
`localStorage` under `qm_progress_<userId>`.

**Unit of storage: (userId, conceptId, bloom) → `{ value: 0..1, count }`.**

Update rule, with `score` the 0–1 result of one scored answer:

```
if there is no prior value:  value = score
otherwise:                   value = 0.3 * score + 0.7 * oldValue
count = count + 1
```

Recent answers matter, but one bad day does not erase a concept.

**Roll-ups**

| level | value | shown as |
| --- | --- | --- |
| concept | mean of the Bloom levels attempted for that concept | "Learning · 62% estimated mastery" |
| topic | mean of the concepts in the topic that have an estimate | plus "based on N of M concepts" |
| course | same, over the course's concepts | plus "based on N of M concepts" |

**Confidence** — by the number of scored answers behind a concept:

| scored answers | confidence |
| --- | --- |
| 0 | no estimate at all |
| < 3 | Low |
| 3–7 | Moderate |
| ≥ 8 | High |

**Never a number without evidence.** A concept with no scored answers reads
**"No estimate"**, not "0%". A topic or course rolls up only over concepts that
have an estimate, and always says how many of how many that is.

**Mastery is only ever changed by a scored answer.** Reviewing a lesson, opening
a resource, or marking a note as read never moves it.

## 5. Completion is separate

Completion is stored separately from mastery and never feeds it:

- **lessons reviewed** — the student marked a study note as reviewed
- **resources opened** — the "Mark as opened" toggle on a resource card

It answers "how much have I read?", not "what do I know?".

## 6. Study material

- Sections are titled **"Study material (optional)"**.
- Each card shows title, provider, type icon, minutes, licence and a one-line
  `why`.
- Links open in a **new tab** with `rel="noopener noreferrer"`.
- **"Mark as opened"** is per user, and affects completion only.
- **Nothing is gated.** "Practice this concept" is always enabled, whether or not
  the concept has a single resource.
- No resources → **"No study material added yet."** No placeholder links, ever.

## 7. Vocabulary

| say | not |
| --- | --- |
| Start practice / Continue practice | Start learning / Continue learning |
| My courses | My Learning |
| Create a practice plan | Create a learning path |
| Study material | Resources list, further reading |
| Study notes | Lessons, course content, reading |
| No estimate | 0% |
| Self-marked | AI-graded (while mocked) |
| "4 concepts · 2 resources · 16 questions" | "No content yet" |

## 8. States

Every data page has three states, all of them written:

- **Loading** — skeletons that match the shape of the loaded content.
- **Error** — what failed, and a retry.
- **Empty** — what is missing and what the student can do instead. An empty
  catalogue, a course with no questions, a concept with no resources, a session
  with an empty bank: each says something true and specific.

No empty state ever contains an invented question, URL or number.

## 9. Where things live

| concern | file |
| --- | --- |
| content files | `frontend/src/content/os/**` |
| content loader (single read API) | `frontend/src/content/os/index.js` |
| mastery | `frontend/src/lib/mastery.js` + `qm_progress_<userId>` |
| completion (lessons reviewed, checks) | `frontend/src/content/lessonProgress.js` |
| session state | `frontend/src/context/SessionContext.jsx` |
| validator / links / import | `frontend/scripts/{validate-content,check-links,import-content}.mjs` |
| backend contract | `frontend/src/api/**` — the mock dispatcher decides mock vs real |

**The real API paths are a fixed contract.** `src/api` client and endpoint code
is not changed when the frontend is redesigned; behaviour is switched through the
mock dispatcher (`VITE_USE_MOCKS`, `VITE_MOCK_<DOMAIN>`).

## 10. Not in this round

- No full knowledge-graph rebuild beyond the small per-concept map.
- No AI grading in mock mode — a self-marked short answer is labelled as such.
- No generated questions, no guessed resources, no placeholder copy.
