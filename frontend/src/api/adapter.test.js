/**
 * The contract boundary: what the browser sends and what it reads back.
 *
 * Adaptive generation is the demo default, so no Bloom level or difficulty is
 * sent unless the caller explicitly opts out. Both response shapes the backend
 * can return are mapped, including the reason its adaptive rung was chosen.
 */

import { describe, expect, it } from 'vitest'
import {
  adaptGenerateQuestionsRequest,
  adaptGenerateQuestionsResponse,
  adaptSubmitAttemptRequest,
} from './adapter.js'

describe('adaptGenerateQuestionsRequest', () => {
  it('sends adaptive:true by default and takes the count from count', () => {
    const payload = adaptGenerateQuestionsRequest(
      { topic: 'Deadlocks', count: 3, bloom_level: 'understand', difficulty: 'medium' },
      'user-1'
    )

    expect(payload.adaptive).toBe(true)
    expect(payload.num_questions).toBe(3)
    expect(payload.topic).toBe('Deadlocks')
    expect(payload.subject).toBe('Deadlocks')
    expect(payload).not.toHaveProperty('bloom_level')
    expect(payload).not.toHaveProperty('difficulty')
  })

  it('keeps bloom_level and difficulty as an explicit manual override', () => {
    const payload = adaptGenerateQuestionsRequest(
      {
        topic: 'Deadlocks',
        adaptive: false,
        bloom_level: 'analyze',
        difficulty: 'hard',
        uploaded_only: true,
      },
      'user-1'
    )

    expect(payload.adaptive).toBe(false)
    expect(payload.bloom_level).toBe('analyze')
    expect(payload.difficulty).toBe('hard')
    expect(payload.uploaded_only).toBe(true)
  })
})

describe('adaptGenerateQuestionsResponse', () => {
  it('maps every question in a questions[] batch, including its source and reason', () => {
    const result = adaptGenerateQuestionsResponse({
      questions: [
        {
          question_id: 'q1',
          question_text: 'Why paging?',
          bloom_level: 'apply',
          source: 'live',
          adaptive_reason: 'moving up after strong answers',
        },
      ],
    })

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({
      question_id: 'q1',
      question_text: 'Why paging?',
      bloom_level: 'apply',
      source: 'live',
      adaptive_reason: 'moving up after strong answers',
    })
  })

  it('maps the legacy single-question fields too', () => {
    const result = adaptGenerateQuestionsResponse({
      id: 7,
      question: 'Why paging?',
      difficulty: 'medium',
      source: 'cache',
      adaptive_reason: 'starting at the first rung',
    })

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({
      question_id: 7,
      question_text: 'Why paging?',
      difficulty: 'medium',
      source: 'cache',
      adaptive_reason: 'starting at the first rung',
    })
  })
})

describe('adaptSubmitAttemptRequest', () => {
  it('forwards the stable submission id to the backend', () => {
    const payload = adaptSubmitAttemptRequest(
      { question_id: 'q1', answer_text: 'answer', submission_id: 'abc-123' },
      'user-1'
    )

    expect(payload.submission_id).toBe('abc-123')
    expect(payload.user_answer).toBe('answer')
    expect(payload.user_id).toBe('user-1')
  })
})
