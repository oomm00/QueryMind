/**
 * Test fixtures.
 *
 * Every URL points at example.com and no app file imports this module: it exists
 * so the tests can describe a question, a concept, a resource or a session
 * without depending on what the real content happens to hold this week.
 */

export const mcqQuestion = {
  id: 'fixture-mcq-1',
  type: 'mcq',
  bloom: 'understand',
  difficulty: 'medium',
  prompt: 'With a 4 KiB page size and page_table[3] = 5, which physical address maps 13,192?',
  options: ['13,192', '21,384', '20,480', '24,576'],
  correctIndex: 1,
  explanation: 'Only the page number is translated through the table; the offset stays.',
  needsHumanCheck: false,
}

export const secondMcqQuestion = {
  id: 'fixture-mcq-2',
  type: 'mcq',
  bloom: 'apply',
  difficulty: 'hard',
  prompt: 'Which change would make a page-table walk longer?',
  options: ['Adding a level', 'A larger offset', 'A smaller frame', 'A warm TLB'],
  correctIndex: 0,
  explanation: 'Each extra level is another memory reference before the frame is known.',
  needsHumanCheck: false,
}

export const shortQuestion = {
  id: 'fixture-short-1',
  type: 'short',
  bloom: 'apply',
  difficulty: 'hard',
  prompt: 'Walk through translating a virtual address with a two-level page table.',
  answerKey:
    'Split the address into page-directory, page-table and offset fields; each level is a lookup; the offset is copied through unchanged.',
  rubric: [
    { criterion: 'Names the fields the address splits into', points: 2 },
    { criterion: 'Walks the lookups in order', points: 1 },
    { criterion: 'Keeps the offset unchanged', points: 1 },
  ],
  explanation: 'Each level narrows the page number until the frame number is known.',
  needsHumanCheck: true,
}

export const resource = {
  title: 'Fixture reading on paging',
  url: 'https://example.com/paging',
  type: 'article',
  provider: 'Example Press',
  license: 'CC BY 4.0',
  estMinutes: 12,
  why: 'Sets out the same walk the lesson does.',
  verifiedOn: '2026-09-01',
}

export const concept = {
  id: 'fixture-concept',
  title: 'Fixture concept',
  topicId: 'fixture-topic',
  prerequisites: [],
  resources: [resource],
  questions: [mcqQuestion, secondMcqQuestion, shortQuestion],
  lessonQuestions: [],
  lessons: [],
}

/** A minimal topic of two concepts, for the bank and mini-map tests. */
export const topic = {
  id: 'fixture-topic',
  title: 'Fixture topic',
  concepts: [
    {
      id: 'first-concept',
      title: 'First concept',
      questions: [mcqQuestion],
      lessonQuestions: [],
      prerequisites: [],
      resources: [],
    },
    {
      id: 'second-concept',
      title: 'Second concept',
      questions: [],
      lessonQuestions: [],
      prerequisites: [{ id: 'first-concept', title: 'First concept' }],
      resources: [],
    },
  ],
}
