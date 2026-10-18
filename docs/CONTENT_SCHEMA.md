# Content Schema

QueryMind is an **assessment and practice platform** with optional study material.
Everything a student can practise or read comes from the content files described
here; nothing is generated, invented or hard-coded in the app. See
[PRODUCT_MODEL.md](./PRODUCT_MODEL.md) for the product rules that these shapes
serve.

Every content file is plain JSON under `frontend/src/content/<course-id>/` and is
loaded by `frontend/src/content/os/index.js` (the content loader) at build time.

## Shapes

### course

A course is declared in the loader (`COURSE` in `src/content/os/index.js`), not in
a file of its own:

```typescript
course = {
  id: string,            // "os"
  title: string,         // "Operating Systems"
  summary: string,       // 2-3 sentences
  level: "intro" | "intermediate" | "advanced",
  topicIds: string[]     // ["memory-management", ...]
}
```

The Explore catalog uses its own slugs (for example `operating-systems`); the
loader maps them onto the content course id, and both resolve.

### topic

Two on-disk shapes are supported and normalised into one topic graph.

Flat topic — `src/content/os/<topic-id>.json`:

```json
{
  "id": "processes-threads",
  "title": "Processes and Threads",
  "concepts": ["concept-process-state", "concept-thread-state"]
}
```

Folder topic — `src/content/os/<topic-id>/topic.json`:

```json
{
  "title": "Memory management",
  "summary": "One line about the topic.",
  "concepts": {
    "concept-paging": {
      "title": "Paging",
      "summary": "One line about the concept.",
      "prerequisiteIds": ["concept-address-translation"],
      "prerequisiteLabels": { "concept-address-translation": "Address translation" },
      "lessonIds": ["lesson-from-virtual-to-physical"],
      "resources": [],
      "questions": []
    }
  }
}
```

| field | required | notes |
| --- | --- | --- |
| `title` | yes | Sentence case, as authored |
| `summary` | no | Shown on the concept panel and in list views |
| `prerequisiteIds` | no | Concept ids; must exist somewhere in the content set |
| `prerequisiteLabels` | no | Link name per prerequisite id, so the graph edge can be labelled |
| `lessonIds` | no | Lesson file stems (`lesson-from-virtual-to-physical`) or full ids |
| `resources` | no | Optional study material, see below |
| `questions` | no | The practice bank, see below |

A topic may carry concepts with no lessons and no questions — an unwritten topic
— and the app says so rather than inventing content.

### concept (normalised, as the app sees it)

```typescript
concept = {
  id: string,
  title: string,
  summary: string,
  prerequisiteIds: string[],
  prerequisiteLabels: Record<string, string>,
  lessonIds: string[],
  topicId: string,
  resources: Resource[],
  questions: Question[],
  // resolved for rendering:
  prerequisites: { id: string, title: string, topicId: string, label: string | null }[],
  lessons: { id: string, title: string, estMinutes: number, topicId: string, isPlaceholder: boolean }[],
  // the checks this concept's lessons already ask, as questions that can be
  // practised (each carries lessonId and blockIndex, so an answer lands on the
  // same record the reader writes to)
  lessonQuestions: Question[],
  resourceCount: number,
  questionCount: number   // questions.length + lessonQuestions.length
}
```

`getCourse()` also reports per-topic `conceptCount`, `lessonCount`,
`resourceCount` and `questionCount` so overview screens never have to load every
concept to count things.

### Resource (study material, optional)

```typescript
resource = {
  title: string,        // "Operating Systems: Three Easy Pieces — Paging"
  url: string,          // https only
  type: "article" | "video" | "book" | "docs" | "interactive" | "notes",
  provider: string,     // "OSTEP", "MIT OpenCourseWare", "MDN"
  license: string,      // "CC BY-SA 4.0", "All rights reserved", "Public domain"
  estMinutes: number,   // rough time to read/watch, > 0
  why: string,          // one line: why this resource, for this concept
  verifiedOn: string    // ISO date a human last opened the link
}
```

Rules:

- `url` must be `https://` — there are no http links and no placeholders.
- At most **3** resources per concept. A concept is practised, not researched.
- `why` explains the link's job; it is never "see also" or "for more
  information".
- `verifiedOn` records the last human check. `npm run check:links` writes a
  report (`link-report.json`) but never edits content: only a human sets
  `verifiedOn`.
- A concept with no resources shows **"No study material added yet."** — that is
  a valid state, not a gap to fill with a guessed URL.
- Nothing gates practice on a link. A student can mark a link as opened, which is
  a session log kept in `studyMaterial.js`; it is never mastery.

### Question (the practice bank)

```typescript
question = {
  id: string,                                  // unique in the whole content set
  type: "mcq" | "short",
  bloom: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
  difficulty: "easy" | "medium" | "hard",
  prompt: string,
  // mcq only:
  options?: string[],                          // exactly 4, distinct
  correctIndex?: number,                       // 0..3, within options
  // short only:
  answerKey?: string,                          // the model answer
  rubric?: { criterion: string, points: number }[],  // points must sum > 0
  explanation: string,                         // why the answer is the answer
  needsHumanCheck: boolean                     // true when unreviewed
}
```

Rules:

- `id` should be `<concept-id>-q1`, `-q2`, … and must be unique across the course.
- An `mcq` has exactly four distinct options and a `correctIndex` in range.
- A `short` question has an `answerKey` and a rubric whose points sum above zero.
- `needsHumanCheck` is `true` for anything drafted by a model and not yet read by
  a human. It is shown in the app so a student knows the question is unvetted.
- Questions are answerable from the referenced content: no trivia, no questions
  about the content's own wording.

### lesson (study notes, optional)

```typescript
lesson = {
  id: string,           // "lesson-from-virtual-to-physical"
  title: string,        // sentence case
  estMinutes: number,
  source: "Official material" | "Your notes",
  objectives: string[],
  blocks: Block[]
}
```

Lessons are the written study notes. They are optional: a concept can be
practised without any notes. The reader labels the workspace **Study notes**, the
left rail labels the list **Outline**, and reviewing a lesson updates
**completion only, never mastery**.

### Block types

```typescript
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "code"; label: string; language: string; text: string }
  | { kind: "callout"; tone: "tip" | "warning"; title: string; text: string }
  | { kind: "diagram"; kind: "address-split"; data: object }
  | { kind: "check"; question: string; options: string[]; correctIndex: number; explanation: string }
  | { kind: "note"; text: string }
```

An older lesson may carry its check as a top-level `check` object instead of a
`check` block; the loader folds it into `blocks`. Authored checks stay valid, and
the same question may also live in the concept's `questions[]` bank so it can be
practised. A check block the concept's `questions[]` does not repeat is still
practisable — the loader turns it into a question (id `check-<lesson-id>-<index>`)
so a student can be asked it in a session as well as in the reader.

## File organisation

```
frontend/src/content/os/
  <topic-id>.json                  flat topic (concepts as a list of ids)
  <topic-id>/topic.json            folder topic (concepts as a map of seeds)
  <topic-id>/<lesson-stem>.json    one lesson per file
```

- A lesson file's `id` is `lesson-<stem>`; a topic's `lessonIds` may use either
  the stem or the full id.
- Adding a lesson is adding a file: the loader globs the directory, so no import
  list needs updating.
- `topic.json` wins over a same-named flat topic file for the same topic id.

## Validation

`npm run validate:content` (`frontend/scripts/validate-content.mjs`) walks every
content file and fails on:

- invalid JSON
- a concept missing a required field, or not an object
- an mcq without exactly four distinct options, or with `correctIndex` outside
  `options`
- a short question without an `answerKey`, or with a rubric whose points do not
  sum above zero
- a question id that is not unique
- a `prerequisiteIds` entry that no concept defines
- a resource `url` that is not `https://`, or more than 3 resources on a concept
- banned drafting phrases: `wait,`, `let me recalculate`, `TODO`

`npm run check:links` is **not** part of the build. It fetches every resource URL
with a timeout and writes a report; 403, 429 and 999 mean "check by hand", not
broken.

`node scripts/import-content.mjs <file.json> <course-id>` validates a topic file
written elsewhere (for example by ChatGPT), then copies it into
`src/content/<course-id>/<topic-id>/`.

## Content guidelines

- Content must be factually correct for an undergraduate OS course. If a fact is
  uncertain, leave it out rather than guess.
- No lorem ipsum, no empty lessons, no invented URLs, no placeholder text.
- A model-drafted file carries a `"comment": "AI-drafted, needs review"` field
  and its questions set `needsHumanCheck: true`.
- Check questions have four options and one correct answer.
- Units, addresses and worked numbers must be consistent across a topic.
