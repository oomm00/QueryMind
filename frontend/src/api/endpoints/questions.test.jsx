/**
 * The generation endpoint is where a backend code becomes a sentence: whatever
 * the backend refuses with, the caller catches an ApiError that is ready for
 * ErrorState or Toast, with the code kept where only the logs need it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, apiFetch: vi.fn() }
})

import { ApiError, apiFetch } from '../client.js'
import { questionsApi } from './questions.js'

const DUPLICATE = 'That question was already asked. Try a different topic or Bloom level.'
const BUSY = 'The AI is busy. Try again in a minute.'

/** A failure exactly as apiFetch builds it from the backend body. */
function backendFailure(code, { status = 400, detail = 'Internal detail, for the logs' } = {}) {
  return new ApiError(status, detail, { detail, code })
}

/** The rejection, so its flags can be checked as well as its message. */
async function failureOf(payload) {
  return questionsApi.generate(payload, 'user-1').then(
    () => null,
    (error) => error
  )
}

beforeEach(() => {
  // The real path: the backend is the one answering.
  vi.stubEnv('VITE_MOCK_QUESTIONS', 'false')
  apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a successful generation', () => {
  it('sends the adapted payload and answers in the contract shape', async () => {
    apiFetch.mockResolvedValue({ questions: [{ id: 7, question_text: 'Why paging?' }] })

    const result = await questionsApi.generate(
      { topic: 'Paging', bloom_level: 'understand', difficulty: 'medium', count: 2 },
      'user-1'
    )

    expect(apiFetch).toHaveBeenCalledWith('/questions/generate', {
      method: 'POST',
      body: JSON.stringify({
        topic: 'Paging',
        subject: 'Paging',
        bloom_level: 'understand',
        difficulty: 'medium',
        question_type: 'open',
        num_questions: 2,
        document_id: null,
      }),
      // The deadline travels with every generation.
      signal: expect.anything(),
    })
    expect(result).toEqual({
      questions: [
        {
          question_id: 7,
          question_text: 'Why paging?',
          bloom_level: undefined,
          difficulty: undefined,
          topic: undefined,
          starter_code: undefined,
          test_cases: undefined,
          hints: undefined,
          options: undefined,
          correct_answer: undefined,
          explanation: undefined,
        },
      ],
    })
  })
})

describe('a refused generation', () => {
  it('throws the sentence for DUPLICATE_QUESTION, with no retry', async () => {
    apiFetch.mockRejectedValue(backendFailure('DUPLICATE_QUESTION', { status: 409 }))

    const error = await failureOf({ topic: 'Paging' })

    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe(DUPLICATE)
    expect(error.code).toBe('DUPLICATE_QUESTION')
    expect(error.retryable).toBe(false)
    expect(error.status).toBe(409)
    // The body survives for the logs; the message does not leak the detail.
    expect(error.data).toEqual({ detail: 'Internal detail, for the logs', code: 'DUPLICATE_QUESTION' })
  })

  it('throws the sentence for a busy model, with retry', async () => {
    apiFetch.mockRejectedValue(backendFailure('LLM_QUOTA_EXHAUSTED', { status: 429 }))

    const error = await failureOf({ topic: 'Paging' })

    expect(error.message).toBe(BUSY)
    expect(error.retryable).toBe(true)
    expect(error.code).toBe('LLM_QUOTA_EXHAUSTED')
  })

  it('throws a sentence rather than a code when the backend says something new', async () => {
    apiFetch.mockRejectedValue(backendFailure('BRAND_NEW_CODE', { status: 500 }))

    const error = await failureOf({ topic: 'Paging' })

    expect(error.message).toBe('Something went wrong. Try again.')
    expect(error.retryable).toBe(false)
    expect(error.message).not.toContain('BRAND_NEW_CODE')
  })

  it('throws a sentence for a network failure with no body at all', async () => {
    apiFetch.mockRejectedValue(new ApiError(0, 'Network request failed', null))

    const error = await failureOf({ topic: 'Paging' })

    expect(error.message).toBe('Something went wrong. Try again.')
    expect(error.status).toBe(0)
    expect(error.data).toBeNull()
  })
})

describe('with question generation mocked', () => {
  it('answers from the mock bank and never calls the backend', async () => {
    vi.stubEnv('VITE_MOCK_QUESTIONS', 'true')

    const result = await questionsApi.generate({ topic: 'Paging', count: 2 }, 'user-1')

    expect(apiFetch).not.toHaveBeenCalled()
    expect(result.questions).toHaveLength(2)
  })
})
