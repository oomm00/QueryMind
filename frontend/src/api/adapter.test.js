import { describe, expect, it } from 'vitest'
import { adaptGenerateQuestionsRequest, adaptSubmitAttemptRequest } from './adapter.js'

describe('adaptGenerateQuestionsRequest', () => {
  it('sends adaptive:true by default so the backend chooses the rung', () => {
    const payload = adaptGenerateQuestionsRequest(
      { topic: 'Deadlocks', count: 3, bloom_level: 'understand', difficulty: 'medium' },
      'user-1'
    )
    expect(payload.adaptive).toBe(true)
    expect(payload.num_questions).toBe(3)
    expect(payload).not.toHaveProperty('bloom_level')
    expect(payload).not.toHaveProperty('difficulty')
  })

  it('forwards the stable submission id to the backend', () => {
    const payload = adaptSubmitAttemptRequest(
      { question_id: 'q1', answer_text: 'answer', submission_id: 'abc-123' },
      'user-1'
    )
    expect(payload.submission_id).toBe('abc-123')
    expect(payload.user_answer).toBe('answer')
  })

  it('keeps manual bloom/difficulty as an explicit override', () => {
    const payload = adaptGenerateQuestionsRequest(
      { topic: 'Deadlocks', adaptive: false, bloom_level: 'analyze', difficulty: 'hard' },
      'user-1'
    )
    expect(payload.adaptive).toBe(false)
    expect(payload.bloom_level).toBe('analyze')
    expect(payload.difficulty).toBe('hard')
  })
})
