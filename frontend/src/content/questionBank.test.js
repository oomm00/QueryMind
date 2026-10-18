/**
 * questionBank — the bank is what the content holds, the mix is by Bloom level,
 * and grading follows the question type: mcq here, rubric self-marked.
 */

import { describe, expect, it } from 'vitest'
import { concept, mcqQuestion, secondMcqQuestion, shortQuestion, topic } from '../__fixtures__/content.js'
import {
  ANY_DIFFICULTY,
  BANK_SOURCE_LABEL,
  bloomMix,
  choiceLabel,
  conceptBank,
  courseBank,
  difficultyFit,
  gradeChoice,
  mixByBloom,
  pickBank,
  questionsForChoice,
  resolveChoice,
  rubricScore,
  topicBank,
  toSessionQuestion,
} from './questionBank.js'

describe('toSessionQuestion', () => {
  it('carries where the question came from', () => {
    const question = toSessionQuestion(mcqQuestion, concept, 'concept')

    expect(question.question_id).toBe('fixture-mcq-1')
    expect(question.conceptId).toBe('fixture-concept')
    expect(question.conceptTitle).toBe('Fixture concept')
    expect(question.topicId).toBe('fixture-topic')
    expect(question.originLabel).toBe('Concept bank')
    expect(question.bloom_level).toBe('understand')
    expect(question.difficulty).toBe('medium')
    expect(question.options).toHaveLength(4)
    expect(question.correctIndex).toBe(1)
    expect(question.resources).toEqual(concept.resources)
  })

  it('labels a question taken from a study note as such', () => {
    const question = toSessionQuestion(
      { ...mcqQuestion, lessonId: 'lesson-one', blockIndex: 2 },
      concept,
      'lesson'
    )
    expect(question.originLabel).toBe('Study notes check')
    expect(question.lessonId).toBe('lesson-one')
    expect(question.blockIndex).toBe(2)
  })

  it('never invents the parts a question does not have', () => {
    const question = toSessionQuestion({ id: 'sparse', type: 'short' }, null)
    expect(question.question_text).toBe('')
    expect(question.answerKey).toBe('')
    expect(question.rubric).toEqual([])
    expect(question.resources).toEqual([])
    expect(question.conceptId).toBe('')
    expect(question.correctIndex).toBeUndefined()
  })
})

describe('conceptBank', () => {
  it('lists the concept own questions, the authored ones first', () => {
    const bank = conceptBank({
      ...concept,
      questions: [mcqQuestion],
      lessonQuestions: [{ ...secondMcqQuestion, lessonId: 'lesson-one', blockIndex: 0 }],
    })

    expect(bank.map((question) => question.question_id)).toEqual([
      'fixture-mcq-1',
      'fixture-mcq-2',
    ])
    expect(bank.map((question) => question.origin)).toEqual(['concept', 'lesson'])
  })

  it('is empty for a concept with nothing written', () => {
    expect(conceptBank({ questions: [], lessonQuestions: [] })).toEqual([])
    expect(conceptBank(null)).toEqual([])
  })
})

describe('topicBank and courseBank', () => {
  it('keeps only the concepts that have questions, and flattens them', () => {
    const bank = topicBank(topic)

    expect(bank.id).toBe('fixture-topic')
    expect(bank.conceptCount).toBe(1)
    expect(bank.concepts.map((entry) => entry.id)).toEqual(['first-concept'])
    expect(bank.questions).toHaveLength(1)
  })

  it('drops a topic with nothing to ask from the course bank', () => {
    const bank = courseBank([topic, { id: 'empty-topic', title: 'Empty', concepts: [] }])
    expect(bank.map((entry) => entry.id)).toEqual(['fixture-topic'])
  })

  it('returns null for an unknown topic rather than an empty bank', () => {
    expect(topicBank(null)).toBeNull()
  })
})

describe('bloomMix and mixByBloom', () => {
  const questions = [
    { question_id: 'a', bloom_level: 'understand' },
    { question_id: 'b', bloom_level: 'understand' },
    { question_id: 'c', bloom_level: 'apply' },
  ]

  it('counts what the bank holds at each level', () => {
    expect(bloomMix(questions)).toEqual([
      { level: 'understand', count: 2 },
      { level: 'apply', count: 1 },
    ])
  })

  it('round-robins the levels so a session is never one level on end', () => {
    expect(mixByBloom(questions).map((question) => question.question_id)).toEqual(['a', 'c', 'b'])
  })
})

describe('pickBank', () => {
  const questions = [
    { question_id: 'a', bloom_level: 'remember', difficulty: 'easy' },
    { question_id: 'b', bloom_level: 'apply', difficulty: 'hard' },
    { question_id: 'c', bloom_level: 'apply', difficulty: 'hard' },
  ]

  it('caps the session at the bank size', () => {
    expect(pickBank(questions, { count: 10 })).toHaveLength(3)
    expect(pickBank(questions, { count: 2 })).toHaveLength(2)
    expect(pickBank([], { count: 5 })).toEqual([])
  })

  it('mixes Bloom levels', () => {
    expect(pickBank(questions, { count: 2 }).map((question) => question.question_id)).toEqual([
      'a',
      'b',
    ])
  })

  it('honours a difficulty only when the bank can fill the session with it', () => {
    const hard = pickBank(questions, { count: 2, difficulty: 'hard' })
    expect(hard.map((question) => question.question_id)).toEqual(['b', 'c'])

    // Only one easy question: the session covers the whole bank instead.
    const easy = pickBank(questions, { count: 3, difficulty: 'easy' })
    expect(easy).toHaveLength(3)
    expect(pickBank(questions, { count: 1, difficulty: ANY_DIFFICULTY })).toHaveLength(1)
  })
})

describe('difficultyFit', () => {
  const questions = [
    { question_id: 'a', bloom_level: 'remember', difficulty: 'easy' },
    { question_id: 'b', bloom_level: 'apply', difficulty: 'hard' },
    { question_id: 'c', bloom_level: 'apply', difficulty: 'hard' },
  ]

  it('says when the preference can carry the session', () => {
    expect(difficultyFit(questions, { count: 2, difficulty: 'hard' })).toEqual({
      used: true,
      matching: 2,
    })
    expect(difficultyFit(questions, { count: 3, difficulty: 'easy' })).toEqual({
      used: false,
      matching: 1,
    })
    expect(difficultyFit(questions, { count: 3 })).toEqual({ used: false, matching: 3 })
    expect(difficultyFit(questions, { count: 0, difficulty: 'easy' })).toEqual({
      used: false,
      matching: 1,
    })
  })
})

describe('resolveChoice and questionsForChoice', () => {
  // The setup form works on banks, which is what these helpers take.
  const banks = [topicBank(topic)]

  it('resolves an id, a title, and a stale link', () => {
    expect(resolveChoice(banks, { concept: 'first-concept' })).toBe('concept:first-concept')
    expect(resolveChoice(banks, { concept: 'First concept' })).toBe('concept:first-concept')
    expect(resolveChoice(banks, { topic: 'fixture-topic' })).toBe('topic:fixture-topic')
    expect(resolveChoice(banks, { topic: 'no-such-topic' })).toBe('concept:first-concept')
    // Links written before ids were passed name a concept in the topic slot.
    expect(resolveChoice(banks, { topic: 'first-concept' })).toBe('concept:first-concept')
    expect(resolveChoice([], {})).toBe('')
  })

  it('gives the questions behind a choice and its name', () => {
    expect(questionsForChoice(banks, 'concept:first-concept')).toHaveLength(1)
    expect(questionsForChoice(banks, 'concept:second-concept')).toEqual([])
    expect(questionsForChoice(banks, 'topic:fixture-topic')).toHaveLength(1)
    expect(questionsForChoice(banks, 'nonsense')).toEqual([])

    expect(choiceLabel(banks, 'concept:first-concept')).toBe('First concept')
    expect(choiceLabel(banks, 'topic:fixture-topic')).toBe('Fixture topic')
    expect(choiceLabel(banks, 'concept:gone')).toBe('')
  })
})

describe('gradeChoice', () => {
  it('scores an mcq from its authored correctIndex', () => {
    expect(gradeChoice(toSessionQuestion(mcqQuestion, concept), 1)).toEqual({
      correct: true,
      score: 1,
      selfMarked: false,
    })
    expect(gradeChoice(toSessionQuestion(mcqQuestion, concept), 3)).toEqual({
      correct: false,
      score: 0,
      selfMarked: false,
    })
  })

  it('treats an unanswered or malformed choice as wrong, never as right', () => {
    const question = toSessionQuestion(mcqQuestion, concept)
    expect(gradeChoice(question, null).correct).toBe(false)
    expect(gradeChoice(question, '1').correct).toBe(false)
    expect(gradeChoice(undefined, 1).correct).toBe(false)
  })
})

describe('rubricScore', () => {
  const rubric = shortQuestion.rubric

  it('is the share of points the ticked criteria carry', () => {
    expect(rubricScore(rubric, [0, 1])).toEqual({ score: 0.75, earned: 3, total: 4 })
    expect(rubricScore(rubric, [0])).toEqual({ score: 0.5, earned: 2, total: 4 })
    expect(rubricScore(rubric, [])).toEqual({ score: 0, earned: 0, total: 4 })
    expect(rubricScore(rubric, [0, 1, 2])).toEqual({ score: 1, earned: 4, total: 4 })
  })

  it('is zero, not a division by zero, when there is no rubric', () => {
    expect(rubricScore([], [0])).toEqual({ score: 0, earned: 0, total: 0 })
    expect(rubricScore(undefined, [0])).toEqual({ score: 0, earned: 0, total: 0 })
  })

  it('ignores ticks that are not criteria', () => {
    expect(rubricScore(rubric, [9])).toEqual({ score: 0, earned: 0, total: 4 })
  })
})

describe('the source label', () => {
  it('is the words the pages show on every question', () => {
    expect(BANK_SOURCE_LABEL).toBe('Course bank')
  })
})
