/**
 * Obviously fake practice content, for the page tests.
 *
 * The tests mock the content loader with this tree, so nothing in them depends
 * on the authored Operating Systems course: the ids say "fake", the questions
 * are about a made-up cache, and the only thing real about it is the shape -
 * which is the same shape practiceBank returns.
 *
 * The Bloom levels are chosen so a session can be asked for at three bands:
 * easy (remember, understand), medium (apply, analyze) and hard (evaluate,
 * create), with two of each across the two concepts.
 */

function mcq(id, { bloom, conceptId, prompt, options, correctIndex, explanation }) {
  return {
    question_id: id,
    question_text: prompt,
    type: 'mcq',
    bloom_level: bloom,
    difficulty: 'medium',
    options,
    correctIndex,
    answerKey: '',
    rubric: [],
    explanation,
    needsHumanCheck: false,
    topic: 'Fake topic',
    topicId: 'fake-topic',
    conceptId,
    conceptTitle: conceptId === 'fake-concept-a' ? 'Fake concept A' : 'Fake concept B',
    origin: 'concept',
    originLabel: 'Concept bank',
    resources: [],
  }
}

function short(id, { bloom, conceptId, prompt, answerKey, rubric, explanation }) {
  return {
    question_id: id,
    question_text: prompt,
    type: 'short',
    bloom_level: bloom,
    difficulty: 'medium',
    options: [],
    correctIndex: undefined,
    answerKey,
    rubric,
    explanation,
    needsHumanCheck: true,
    topic: 'Fake topic',
    topicId: 'fake-topic',
    conceptId,
    conceptTitle: conceptId === 'fake-concept-a' ? 'Fake concept A' : 'Fake concept B',
    origin: 'concept',
    originLabel: 'Concept bank',
    resources: [],
  }
}

const conceptA = [
  mcq('fake-a1', {
    bloom: 'remember',
    conceptId: 'fake-concept-a',
    prompt: 'What is the name of the fake cache in this made-up system?',
    options: ['Imaginary cache', 'Pretend cache', 'Placeholder cache', 'Fake cache'],
    correctIndex: 3,
    explanation: 'The fixture calls it a fake cache, which is the whole point.',
  }),
  mcq('fake-a2', {
    bloom: 'understand',
    conceptId: 'fake-concept-a',
    prompt: 'What does the fake cache hold?',
    options: ['Nothing at all', 'Pretend copies of imaginary values', 'Real values', 'Other caches'],
    correctIndex: 1,
    explanation: 'It holds pretend copies, because the fixture is invented.',
  }),
  mcq('fake-a3', {
    bloom: 'apply',
    conceptId: 'fake-concept-a',
    prompt: 'A made-up lookup misses. What happens next in this fixture?',
    options: ['Nothing', 'It invents a value', 'It reads the invented store', 'It restarts'],
    correctIndex: 2,
    explanation: 'A miss reads the invented store, which the test does not care about.',
  }),
  short('fake-a4', {
    bloom: 'apply',
    conceptId: 'fake-concept-a',
    prompt: 'In your own words, describe how the fake cache is filled.',
    answerKey: 'The fake cache is filled from the invented store, one pretend value at a time.',
    rubric: [
      { criterion: 'Mentions the invented store', points: 2 },
      { criterion: 'Mentions filling one value at a time', points: 1 },
      { criterion: 'Keeps the answer fake', points: 1 },
    ],
    explanation: 'Any answer mentioning the invented store earns the fake credit.',
  }),
]

const conceptB = [
  mcq('fake-b1', {
    bloom: 'analyze',
    conceptId: 'fake-concept-b',
    prompt: 'Which made-up access pattern is best served by this fake cache?',
    options: ['Random pretend reads', 'Repeated pretend reads', 'No reads', 'Only writes'],
    correctIndex: 1,
    explanation: 'Repeated pretend reads hit the fake cache most often.',
  }),
  short('fake-b2', {
    bloom: 'evaluate',
    conceptId: 'fake-concept-b',
    prompt: 'Judge whether the fake cache is worth its imaginary cost. Explain your view.',
    answerKey: 'It is worth it when repeat reads outnumber the imaginary cost of holding it.',
    rubric: [
      { criterion: 'Weighs repeat reads against cost', points: 2 },
      { criterion: 'Reaches a view either way', points: 2 },
    ],
    explanation: 'Any judgement that weighs both sides is acceptable in the fixture.',
  }),
  mcq('fake-b3', {
    bloom: 'create',
    conceptId: 'fake-concept-b',
    prompt: 'Design a made-up replacement policy for this fake cache.',
    options: ['Always keep one entry', 'Always keep everything', 'Discard the least recently read pretend entry', 'Discard nothing'],
    correctIndex: 2,
    explanation: 'Discarding the least recently read pretend entry is the intended design.',
  }),
  mcq('fake-b4', {
    bloom: 'remember',
    conceptId: 'fake-concept-b',
    prompt: 'How many pretend entries does the fake cache hold in this fixture?',
    options: ['Three', 'Four', 'Five', 'Eight'],
    correctIndex: 3,
    explanation: 'The fixture says eight pretend entries, and eight it is.',
  }),
]

/** Every fixture question, in the order a course-scoped session would draw them. */
export const practiceQuestions = [...conceptA, ...conceptB]

/** The fixture questions by id, which is all the session page needs to resolve them. */
export const questionById = Object.fromEntries(
  practiceQuestions.map((question) => [question.question_id, question])
)

/** One course tree in the shape practiceBank returns, with two concepts. */
export const practiceTree = {
  id: 'fake-course',
  contentId: 'fake-course',
  title: 'Fake course',
  summary: 'A made-up course that exists only so the tests have something to practise.',
  level: 'beginner',
  topics: [
    {
      id: 'fake-topic',
      title: 'Fake topic',
      summary: '',
      concepts: [
        {
          id: 'fake-concept-a',
          title: 'Fake concept A',
          summary: '',
          questionCount: conceptA.length,
          resourceCount: 1,
          resources: [
            {
              title: 'Fake reading about the fake cache',
              url: 'https://example.invalid/fake-cache',
              type: 'article',
              provider: 'Fake Press',
              estMinutes: 5,
            },
          ],
          lessonIds: ['fake-lesson'],
          lessons: [{ id: 'fake-lesson', title: 'Fake written lesson', isPlaceholder: false }],
          questions: conceptA,
        },
        {
          id: 'fake-concept-b',
          title: 'Fake concept B',
          summary: '',
          questionCount: conceptB.length,
          resourceCount: 0,
          resources: [],
          lessonIds: [],
          lessons: [],
          questions: conceptB,
        },
      ],
    },
  ],
}

/** Two catalog entries: one with content behind it, one without. */
export const catalog = [
  {
    id: 'fake-course',
    title: 'Fake course',
    summary: 'A made-up course that exists only so the tests have something to practise.',
    icon: 'chip',
    level: 'Beginner',
    category: 'Systems',
    hours: 3,
    prerequisites: [],
  },
  {
    id: 'empty-course',
    title: 'Empty course',
    summary: 'A made-up course with no questions written for it at all.',
    icon: 'nodes',
    level: 'Beginner',
    category: 'Systems',
    hours: 2,
    prerequisites: ['Fake course'],
  },
]

export const FAKE_USER = 'fake-user'
