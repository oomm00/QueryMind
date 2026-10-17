# Content Schema

This document defines the data schema for the QueryMind course/content system.

## Shapes

### course
```typescript
course = {
  id: string,           // e.g. "os-intro"
  title: string,        // e.g. "Operating Systems Introduction"
  summary: string,      // 2-3 sentence overview
  level: "intro" | "intermediate" | "advanced",
  hours: number,        // estimated total time
  prerequisites: string[],  // ["cs-foundations"]
  topics: string[]      // ["processes-threads", "cpu-scheduling", ...]
}
```

### topic
```typescript
topic = {
  id: string,           // e.g. "processes-threads"
  title: string,        // e.g. "Processes and Threads"
  concepts: string[]    // ["concept-process-state", "concept-thread-state", ...]
}
```

### concept
```typescript
concept = {
  id: string,           // e.g. "concept-address-translation"
  title: string,        // e.g. "Address Translation"
  summary: string,      // 2-3 sentence summary
  prerequisiteIds: string[],  // ["concept-page-tables", ...]
  lessons: string[]     // ["lesson-address-translation-1", ...]
}
```

### lesson
```typescript
lesson = {
  id: string,           // e.g. "lesson-paging-walkthrough"
  title: string,        // e.g. "Page-table walkthrough"
  estMinutes: number,   // estimated minutes to read
  source: "Official material" | "Your notes",
  objectives: string[], // [ "Understand ...", "Be able to ..." ]
  blocks: block[]
}

### block types
block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "code"; label: string; language: string; text: string }
  | { kind: "callout"; tone: "tip" | "warning"; title: string; text: string }
  | { kind: "diagram"; kind: "address-split"; data: any }
  | { kind: "check"; question: string; options: string[]; correctIndex: number; explanation: string }
  | { kind: "note"; text: string }
```

## File Organization

- Content files live at `src/content/os/*.json` — one file per topic
- Each file exports a default object matching the `topic` shape
- File name convention: `{topicId}.json`, e.g. `processes-threads.json`

## Hooks (to be implemented)

- `useCourse(id)` — fetches course metadata, returns course + topic list
- `useLesson(courseId, topicId, lessonId)` — fetches a single lesson by ID
- `useConcept(courseId, topicId, conceptId)` — fetches a single concept + its prerequisite graph

## Operating Systems Content Topics

The following topics are defined for the Operating Systems course:

1. **Processes and Threads** — `processes-threads`
   - Concepts: process state, thread state, scheduling, synchronization

2. **CPU Scheduling** — `cpu-scheduling`
   - Concepts: scheduling algorithms, waiting time, turnaround time

3. **Synchronization** — `synchronization`
   - Concepts: locks, semaphores, monitors, race conditions

4. **Deadlocks** — `deadlocks`
   - Concepts: deadlock conditions, prevention, avoidance, recovery

5. **Memory Management** — `memory-management`
   - Concepts: address translation, paging, segmentation, virtual memory,
     demand paging, page replacement, working sets

6. **Virtual Memory Lab** — `virtual-memory-lab`
   - Concepts: page-table simulation, working set simulation

7. **File Systems** — `file-systems`
   - Concepts: file organization, directory structures, disk allocation

## Technically Correct Content Guidelines

- Content must be factually correct for an undergraduate OS course
- If unsure about a fact, leave it out rather than guess
- Each file must include a comment at the top with the date and:
  `AI-drafted, needs review`
- No lorem ipsum and no empty lessons
- Every concept must have at least 1 lesson
- Check questions must have 4 options with 1 correct answer

## Example: Paging Concept (Full)

The Paging concept file should include:
- 3 lessons: "From virtual to physical addresses", "Page-table walkthrough", "Practice"
- The 4 KiB worked example: virtual address 13,192 → page 3, offset 904, frame 5 → physical 21,384
- Pseudocode block for page-table walkthrough
- "keep the units straight" callout (tone: "tip")
- Check question with 4 options and explanation
- AI-drafted, needs review comment
- Prerequisite: Address translation concept

## Example: Address Translation Concept (Full)

The Address translation concept file should include:
- 1 lesson titled "Address translation"
- Objectives, 2-3 paragraphs, 1 check question
- AI-drafted, needs review comment
- Prerequisite: none (or concept-page-tables if needed)