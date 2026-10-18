/**
 * errorMessages — the AI endpoint error codes, in words a student can act on.
 *
 * A failed generation answers with `{ detail, code }`: the code is the stable
 * contract and the detail is written for whoever reads the logs. Neither belongs
 * on a screen, so every code this endpoint can return is mapped here to one
 * sentence, plus whether trying again has any chance of helping.
 *
 * The mapping belongs to the API layer, not to each screen: `questionsApi.generate`
 * throws an ApiError whose `message` is already the sentence below, so a caller
 * renders it through ErrorState or Toast and never shows a code:
 *
 *   const view = generationError(error)
 *   <ErrorState
 *     title="Could not generate questions"
 *     message={view.message}
 *     onRetry={view.retryable ? retry : undefined}
 *   />
 *
 * Retry is offered only where it could work: a busy model is temporary, while a
 * duplicate question needs a different topic or Bloom level and an unconfigured
 * server needs an operator.
 */

import { ApiError } from './client.js'

/** What each code reads as. These keys are the backend's contract, verbatim. */
export const GENERATION_ERROR_MESSAGES = Object.freeze({
  DUPLICATE_QUESTION: 'That question was already asked. Try a different topic or Bloom level.',
  BLOOM_ALIGNMENT_MISMATCH:
    "The model could not ask that at the level you picked. Try another Bloom level.",
  LLM_QUOTA_EXHAUSTED: 'The AI is busy. Try again in a minute.',
  LLM_UNAVAILABLE: 'The AI is busy. Try again in a minute.',
  LLM_NOT_CONFIGURED: "AI question generation isn't set up on this server yet.",
  NO_CONTEXT: 'No study material for that topic yet. Upload a document, then try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests in a row. Give it a moment, then try again.',
  TIMEOUT: 'That took too long. Check your connection and try again.',
})

/** The codes where another attempt could succeed. */
export const RETRYABLE_GENERATION_CODES = Object.freeze([
  'LLM_QUOTA_EXHAUSTED',
  'LLM_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED',
  'TIMEOUT',
])

/** What an unrecognised failure reads as. */
export const UNKNOWN_GENERATION_MESSAGE = 'Something went wrong. Try again.'

/**
 * The backend's code for this failure, whether the error is still raw from
 * apiFetch (code in the body) or already mapped (code on the error itself).
 * Returns null when there is no code to trust.
 */
export function generationErrorCode(error) {
  if (!error || typeof error !== 'object') return null

  const fromBody = error.data?.code
  if (typeof fromBody === 'string' && fromBody !== '') return fromBody

  if (typeof error.code === 'string' && error.code !== '') return error.code

  return null
}

/** The sentence for this failure. Never a code, never the backend's detail. */
export function generationErrorMessage(error) {
  const code = generationErrorCode(error)
  return GENERATION_ERROR_MESSAGES[code] ?? UNKNOWN_GENERATION_MESSAGE
}

/** Whether offering Retry would be honest for this failure. */
export function isRetryableGenerationError(error) {
  return RETRYABLE_GENERATION_CODES.includes(generationErrorCode(error))
}

/** The three things a screen needs, with no code in sight. */
export function generationError(error) {
  const code = generationErrorCode(error)
  return {
    code,
    message: GENERATION_ERROR_MESSAGES[code] ?? UNKNOWN_GENERATION_MESSAGE,
    retryable: RETRYABLE_GENERATION_CODES.includes(code),
  }
}

/**
 * The same failure as an ApiError the app can render: the status and the body
 * are kept for logs and for anyone who needs the code, the message is replaced
 * with the sentence, and the code moves onto its own field.
 */
export function toFriendlyGenerationError(error) {
  const { code, message, retryable } = generationError(error)
  const data = error?.data && typeof error.data === 'object' ? error.data : null

  const friendly = new ApiError(Number(error?.status) || 0, message, data)
  friendly.code = code
  friendly.retryable = retryable
  friendly.cause = error

  return friendly
}
