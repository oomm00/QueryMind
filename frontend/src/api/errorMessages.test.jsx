/**
 * errorMessages — one test per code the generation endpoint can return, plus
 * what an unrecognised failure reads as, and the two places the app shows such
 * a failure: ErrorState and Toast. No code reaches either of them.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from '../components/ui/ErrorState'
import { Toast } from '../components/ui/Toast'
import { ApiError } from './client.js'
import {
  GENERATION_ERROR_MESSAGES,
  RETRYABLE_GENERATION_CODES,
  UNKNOWN_GENERATION_MESSAGE,
  generationError,
  generationErrorMessage,
  isRetryableGenerationError,
  toFriendlyGenerationError,
} from './errorMessages.js'

/** A failure exactly as apiFetch builds it from the backend body. */
function backendFailure(code, { status = 400, detail = 'Internal detail, for the logs' } = {}) {
  return new ApiError(status, detail, { detail, code })
}

const DUPLICATE = 'That question was already asked. Try a different topic or Bloom level.'
const BUSY = 'The AI is busy. Try again in a minute.'
const NOT_SET_UP = "AI question generation isn't set up on this server yet."

describe('the sentence for each code', () => {
  it('DUPLICATE_QUESTION asks for a different topic or Bloom level, and is not retryable', () => {
    const error = backendFailure('DUPLICATE_QUESTION', { status: 409 })

    expect(generationErrorMessage(error)).toBe(DUPLICATE)
    expect(isRetryableGenerationError(error)).toBe(false)
  })

  it('LLM_QUOTA_EXHAUSTED says the AI is busy, and is retryable', () => {
    const error = backendFailure('LLM_QUOTA_EXHAUSTED', { status: 429 })

    expect(generationErrorMessage(error)).toBe(BUSY)
    expect(isRetryableGenerationError(error)).toBe(true)
  })

  it('LLM_UNAVAILABLE says the AI is busy, and is retryable', () => {
    const error = backendFailure('LLM_UNAVAILABLE', { status: 503 })

    expect(generationErrorMessage(error)).toBe(BUSY)
    expect(isRetryableGenerationError(error)).toBe(true)
  })

  it('LLM_NOT_CONFIGURED says the server is not set up yet, and is not retryable', () => {
    const error = backendFailure('LLM_NOT_CONFIGURED', { status: 503 })

    expect(generationErrorMessage(error)).toBe(NOT_SET_UP)
    expect(isRetryableGenerationError(error)).toBe(false)
  })

  it('an unknown code falls back, and is not retryable', () => {
    const error = backendFailure('SOMETHING_NEW_FROM_THE_BACKEND', { status: 500 })

    expect(generationErrorMessage(error)).toBe(UNKNOWN_GENERATION_MESSAGE)
    expect(generationError(error)).toEqual({
      code: 'SOMETHING_NEW_FROM_THE_BACKEND',
      message: UNKNOWN_GENERATION_MESSAGE,
      retryable: false,
    })
    expect(isRetryableGenerationError(error)).toBe(false)
  })

  it('handles a failure with no body, a plain Error, and nothing at all', () => {
    const bare = new ApiError(0, 'Network request failed', null)
    expect(generationErrorMessage(bare)).toBe(UNKNOWN_GENERATION_MESSAGE)
    expect(generationErrorMessage(new Error('boom'))).toBe(UNKNOWN_GENERATION_MESSAGE)
    expect(generationErrorMessage(null)).toBe(UNKNOWN_GENERATION_MESSAGE)
    expect(generationErrorMessage(undefined)).toBe(UNKNOWN_GENERATION_MESSAGE)
    expect(generationError(null)).toEqual({
      code: null,
      message: UNKNOWN_GENERATION_MESSAGE,
      retryable: false,
    })
  })

  it('knows only the codes the backend still returns', () => {
    expect(Object.keys(GENERATION_ERROR_MESSAGES).sort()).toEqual([
      'DUPLICATE_QUESTION',
      'LLM_NOT_CONFIGURED',
      'LLM_QUOTA_EXHAUSTED',
      'LLM_UNAVAILABLE',
    ])
    expect(Object.keys(GENERATION_ERROR_MESSAGES)).not.toContain('LLM_CALL_FAILED')
    expect(Object.keys(GENERATION_ERROR_MESSAGES)).not.toContain('LLM_MODELS_EXHAUSTED')
    expect([...RETRYABLE_GENERATION_CODES].sort()).toEqual([
      'LLM_QUOTA_EXHAUSTED',
      'LLM_UNAVAILABLE',
    ])
  })

  it('never puts the code itself in the sentence', () => {
    const codes = Object.keys(GENERATION_ERROR_MESSAGES)

    for (const code of codes) {
      const message = generationErrorMessage(backendFailure(code))
      expect(message).not.toContain(code)
      expect(message).not.toBe('Internal detail, for the logs')
      expect(message.length).toBeGreaterThan(0)
    }
  })
})

describe('toFriendlyGenerationError', () => {
  it('replaces the message and keeps the code, status and body for the logs', () => {
    const raw = backendFailure('LLM_QUOTA_EXHAUSTED', { status: 429, detail: 'quota exceeded' })
    const friendly = toFriendlyGenerationError(raw)

    expect(friendly).toBeInstanceOf(ApiError)
    expect(friendly.message).toBe(BUSY)
    expect(friendly.status).toBe(429)
    expect(friendly.code).toBe('LLM_QUOTA_EXHAUSTED')
    expect(friendly.retryable).toBe(true)
    expect(friendly.data).toEqual({ detail: 'quota exceeded', code: 'LLM_QUOTA_EXHAUSTED' })
    expect(friendly.cause).toBe(raw)
  })

  it('is stable when a mapped error is mapped again', () => {
    const once = toFriendlyGenerationError(backendFailure('LLM_NOT_CONFIGURED'))
    const twice = toFriendlyGenerationError(once)

    expect(twice.message).toBe(NOT_SET_UP)
    expect(twice.code).toBe('LLM_NOT_CONFIGURED')
    expect(twice.retryable).toBe(false)
  })
})

describe('showing a generation failure', () => {
  it('reads as a sentence in ErrorState, with Retry only when a retry could help', () => {
    const busy = generationError(backendFailure('LLM_QUOTA_EXHAUSTED'))
    const { unmount } = render(
      <ErrorState
        title="Could not generate questions"
        message={busy.message}
        onRetry={busy.retryable ? vi.fn() : undefined}
      />
    )

    expect(screen.getByText('Could not generate questions')).toBeInTheDocument()
    expect(screen.getByText(BUSY)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('LLM_QUOTA_EXHAUSTED')
    unmount()

    const duplicate = generationError(backendFailure('DUPLICATE_QUESTION'))
    render(
      <ErrorState
        title="Could not generate questions"
        message={duplicate.message}
        onRetry={duplicate.retryable ? vi.fn() : undefined}
      />
    )

    expect(screen.getByText(DUPLICATE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('DUPLICATE_QUESTION')
  })

  it('reads as a sentence in Toast too', () => {
    const notSetUp = generationError(backendFailure('LLM_NOT_CONFIGURED'))

    render(<Toast variant="error" title="Could not generate questions" description={notSetUp.message} />)

    expect(screen.getByRole('status')).toHaveTextContent(NOT_SET_UP)
    expect(document.body.textContent).not.toContain('LLM_NOT_CONFIGURED')
  })
})
