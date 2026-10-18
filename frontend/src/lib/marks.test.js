/**
 * marks — what a question is worth, and how a session's score is worked out.
 * The fixtures are obviously fake: questions carry ids like "q1" and their
 * prompts are one line each.
 */

import { describe, expect, it } from 'vitest'
import {
  MARKS_BY_BLOOM,
  marksAvailable,
  marksEarnedFor,
  marksFor,
  marksForQuestion,
  scoreOf,
  scoreSession,
} from './marks.js'

function mcq(id, bloom, correctIndex = 0) {
  return { question_id: id, type: 'mcq', bloom_level: bloom, correctIndex, options: ['a', 'b'] }
}

function short(id, bloom) {
  return { question_id: id, type: 'short', bloom_level: bloom }
}

describe('marksFor', () => {
  it('follows the Bloom level', () => {
    expect(MARKS_BY_BLOOM).toEqual({
      remember: 1,
      understand: 1,
      apply: 2,
      analyze: 2,
      evaluate: 3,
      create: 3,
    })
    expect(marksFor('remember')).toBe(1)
    expect(marksFor('create')).toBe(3)
  })

  it('gives an unfamiliar level the minimum rather than nothing', () => {
    expect(marksFor('unheard-of')).toBe(1)
    expect(marksFor(undefined)).toBe(1)
  })

  it('reads the level off a question', () => {
    expect(marksForQuestion(mcq('q1', 'evaluate'))).toBe(3)
    expect(marksAvailable([mcq('q1', 'remember'), short('q2', 'apply')])).toBe(3)
  })
})

describe('scoreOf', () => {
  it('scores an mcq from whether the choice was right', () => {
    const question = mcq('q1', 'understand', 1)
    expect(scoreOf(question, { selected: 1 }, null)).toBe(1)
    expect(scoreOf(question, { selected: 0 }, null)).toBe(0)
  })

  it('has no score for an mcq with no choice', () => {
    expect(scoreOf(mcq('q1', 'understand'), {}, null)).toBeNull()
    expect(scoreOf(mcq('q1', 'understand'), null, null)).toBeNull()
  })

  it('scores a short answer from its self-mark, and nothing before that', () => {
    const question = short('q2', 'apply')
    expect(scoreOf(question, { text: 'written' }, null)).toBeNull()
    expect(scoreOf(question, { text: 'written' }, { score: 0.5 })).toBe(0.5)
  })

  it('turns a score into marks', () => {
    expect(marksEarnedFor(short('q2', 'apply'), { text: 'x' }, { score: 0.5 })).toBe(1)
    expect(marksEarnedFor(mcq('q1', 'evaluate', 1), { selected: 1 }, null)).toBe(3)
    expect(marksEarnedFor(short('q2', 'apply'), { text: 'x' }, null)).toBeNull()
  })
})

describe('scoreSession', () => {
  const questions = [mcq('q1', 'understand', 1), mcq('q2', 'apply', 0), short('q3', 'evaluate')]

  it('adds up the marks of everything scored', () => {
    const score = scoreSession(
      questions,
      { q1: { selected: 1 }, q2: { selected: 1 } },
      {}
    )

    // q1 is 1 mark and right; q2 is 2 marks and wrong; q3 is unscored.
    expect(score.earned).toBe(1)
    expect(score.available).toBe(3)
    expect(score.percent).toBeCloseTo(1 / 3, 10)
  })

  it('counts a marked short answer at its rubric share of the marks', () => {
    const score = scoreSession(
      questions,
      { q1: { selected: 1 }, q2: { selected: 1 }, q3: { text: 'my answer' } },
      { q3: { score: 2 / 3, earned: 2, total: 3 } }
    )

    // q1 right (1), q2 wrong (0), q3 two-thirds of 3 marks (2) -> 3 of 6.
    expect(score.earned).toBe(3)
    expect(score.available).toBe(6)
    expect(score.percent).toBe(0.5)
  })

  it('leaves an unanswered mcq and an unmarked short answer out, and says so', () => {
    const score = scoreSession(questions, { q1: { selected: 1 } }, {})

    expect(score.answered).toBe(1)
    expect(score.total).toBe(3)
    expect(score.unscored.map((entry) => entry.reason)).toEqual(['unanswered', 'not-marked'])
    expect(score.percent).toBe(1)
  })

  it('has no percentage when nothing is scored yet', () => {
    const score = scoreSession(questions, {}, {})
    expect(score.percent).toBeNull()
    expect(score.available).toBe(0)
    expect(score.unscored).toHaveLength(3)
  })

  it('reports the score per Bloom level', () => {
    const score = scoreSession(questions, { q2: { selected: 0 } }, {})
    const apply = score.byLevel.find((bucket) => bucket.level === 'apply')
    expect(apply).toEqual({ level: 'apply', earned: 2, available: 2, count: 1 })

    const evaluate = score.byLevel.find((bucket) => bucket.level === 'evaluate')
    expect(evaluate).toEqual({ level: 'evaluate', earned: 0, available: 0, count: 1 })
  })
})
