/**
 * buildSession — what a session asks, and why. The fixtures are obviously fake:
 * a two-course, three-topic tree with ids like "t1c2q3".
 */

import { describe, expect, it } from 'vitest'
import { buildSession, levelsFor, nextTopicOf, PRACTICE_LEVELS } from './buildSession.js'

function q(id, bloom) {
  return { question_id: id, type: 'mcq', bloom_level: bloom, correctIndex: 0, options: ['a', 'b'] }
}

const courses = [
  {
    id: 'os',
    title: 'Operating Systems',
    topics: [
      {
        id: 't1',
        title: 'Fundamentals',
        concepts: [
          {
            id: 'c1',
            title: 'Kernel',
            questions: [q('t1c1q1', 'remember'), q('t1c1q2', 'understand'), q('t1c1q3', 'apply')],
          },
          {
            id: 'c2',
            title: 'System calls',
            questions: [q('t1c2q1', 'remember'), q('t1c2q2', 'apply'), q('t1c2q3', 'analyze')],
          },
        ],
      },
      {
        id: 't2',
        title: 'Scheduling',
        concepts: [
          {
            id: 'c3',
            title: 'Round robin',
            questions: [q('t2c3q1', 'evaluate'), q('t2c3q2', 'create'), q('t2c3q3', 'apply')],
          },
        ],
      },
      {
        id: 't3',
        title: 'Coming later',
        concepts: [{ id: 'c4', title: 'Nothing yet', questions: [] }],
      },
    ],
  },
  {
    id: 'dbms',
    title: 'DBMS',
    topics: [
      { id: 'd1', title: 'SQL', concepts: [{ id: 'dc1', title: 'Joins', questions: [q('d1c1q1', 'remember')] }] },
    ],
  },
]

const data = { courses, estimates: {}, answered: {} }

function blooms(questions) {
  return questions.map((question) => question.bloom_level)
}

describe('level bands', () => {
  it('maps each level onto its Bloom levels', () => {
    expect(levelsFor('easy')).toEqual(['remember', 'understand'])
    expect(levelsFor('medium')).toEqual(['apply', 'analyze'])
    expect(levelsFor('hard')).toEqual(['evaluate', 'create'])
    expect(levelsFor('mixed')).toHaveLength(6)
    expect(PRACTICE_LEVELS.map((level) => level.value)).toEqual(['mixed', 'easy', 'medium', 'hard'])
  })

  it('asks only easy questions when easy is chosen', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't1', level: 'easy', count: 3 }, data)
    expect(session.questions).toHaveLength(3)
    expect(blooms(session.questions).every((b) => ['remember', 'understand'].includes(b))).toBe(true)
    expect(session.note).toBe('')
  })

  it('asks only medium questions when medium is chosen', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't1', level: 'medium', count: 3 }, data)
    expect(session.questions).toHaveLength(3)
    expect(blooms(session.questions).every((b) => ['apply', 'analyze'].includes(b))).toBe(true)
  })
})

describe('a band that cannot fill the session', () => {
  it('fills from the neighbour and says so', () => {
    // t2 has two hard questions (evaluate, create) and one medium (apply).
    const session = buildSession({ scope: 'topic', scopeId: 't2', level: 'hard', count: 6 }, data)

    expect(session.questions).toHaveLength(3)
    expect(session.note).toMatch(/Not enough hard questions here, so a few are medium/)
    expect(blooms(session.questions)).toEqual(expect.arrayContaining(['evaluate', 'create']))
  })

  it('uses what exists with no note when the band can fill it', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't2', level: 'hard', count: 2 }, data)
    expect(session.questions).toHaveLength(2)
    expect(session.note).toBe('')
  })
})

describe('the questions chosen', () => {
  it('never repeats a question', () => {
    const session = buildSession({ scope: 'course', courseId: 'os', level: 'mixed', count: 20 }, data)
    const ids = session.questions.map((question) => question.question_id)
    expect(new Set(ids).size).toBe(ids.length)
    // The course scope draws from its next topic, which here is t1's six.
    expect(ids.length).toBe(6)
  })

  it('spreads a topic across more than one concept', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't1', level: 'mixed', count: 4 }, data)
    expect(new Set(session.questions.map((question) => question.conceptId)).size).toBeGreaterThan(1)
  })

  it('asks only one concept when a concept is the scope', () => {
    const session = buildSession({ scope: 'concept', scopeId: 'c2', level: 'mixed', count: 5 }, data)
    expect(session.questions).toHaveLength(3)
    expect(session.questions.every((question) => question.conceptId === 'c2')).toBe(true)
  })

  it('reorders a mixed session so consecutive levels differ where they can', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't1', level: 'mixed', count: 6 }, data)
    const levels = blooms(session.questions)
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]).not.toBe(levels[index - 1])
    }
  })

  it('spans every course it is given for a mixed scope', () => {
    const session = buildSession({ scope: 'mixed', level: 'mixed', count: 20 }, data)
    expect(new Set(session.questions.map((question) => question.courseId))).toEqual(
      new Set(['os', 'dbms'])
    )
  })

  it('takes exactly the questions it is asked to retry', () => {
    const session = buildSession(
      { scope: 'retry', questionIds: ['t1c1q1', 't2c3q2'], level: 'mixed', count: 6 },
      data
    )
    expect(session.questions.map((question) => question.question_id).sort()).toEqual([
      't1c1q1',
      't2c3q2',
    ])
  })
})

describe('the next topic of a course', () => {
  it('is the first topic with questions and no answers', () => {
    const session = buildSession({ scope: 'course', courseId: 'os', count: 3 }, data)
    expect(session.scopeId).toBe('t1')
  })

  it('moves on once a topic has answers', () => {
    const session = buildSession(
      { scope: 'course', courseId: 'os', count: 3 },
      { ...data, answered: { c1: true, c2: true } }
    )
    expect(session.scopeId).toBe('t2')
  })

  it('is the lowest estimate once everything has answers', () => {
    const answers = { c1: true, c2: true, c3: true }
    const low = nextTopicOf(courses[0], { answers: undefined, estimates: { c1: 0.9, c2: 0.9, c3: 0.2 }, answered: answers })
    expect(low.id).toBe('t2')

    const high = nextTopicOf(courses[0], { estimates: { c1: 0.1, c2: 0.2, c3: 0.8 }, answered: answers })
    expect(high.id).toBe('t1')
  })

  it('ignores a topic with no questions', () => {
    const session = buildSession(
      { scope: 'course', courseId: 'os', count: 3 },
      { ...data, answered: { c1: true, c2: true, c3: true } }
    )
    expect(session.scopeId).not.toBe('t3')
  })
})

describe('nothing to ask', () => {
  const empty = {
    courses: [{ id: 'x', title: 'X', topics: [{ id: 't', concepts: [{ id: 'c', questions: [] }] }] }],
  }

  it('returns no questions for a course with an empty bank', () => {
    const session = buildSession({ scope: 'course', courseId: 'x', count: 6 }, empty)
    expect(session.questions).toEqual([])
  })

  it('returns no questions for an unknown concept', () => {
    const session = buildSession({ scope: 'concept', scopeId: 'nope', count: 6 }, data)
    expect(session.questions).toEqual([])
  })

  it('returns no questions when the count is zero', () => {
    const session = buildSession({ scope: 'topic', scopeId: 't1', count: 0 }, data)
    expect(session.questions).toEqual([])
  })
})
