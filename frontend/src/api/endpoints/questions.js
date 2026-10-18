/**
 * Questions Endpoints
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { createMockQuestions } from '../mocks/data/questions.mock.js'
import {
  adaptGenerateQuestionsRequest,
  adaptGenerateQuestionsResponse,
} from '../adapter.js'
import { toFriendlyGenerationError } from '../errorMessages.js'

/**
 * One generation may think for a while, but a silent hang is worse than an
 * honest deadline: the request always carries this signal (default 60s).
 */
export const GENERATE_TIMEOUT_MS = 60_000

/**
 * The deadline for one call, plus the caller's own signal when it has one. A
 * generation run asks for several questions, so the page needs to be able to
 * cancel the ones still in flight - the deadline alone could not do that.
 */
function deadlineSignal(timeout, signal) {
  const deadline = AbortSignal.timeout(timeout)
  if (!signal) return deadline
  if (signal.aborted) return signal
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, deadline])
  return deadline
}

export const questionsEndpoints = {
  /**
   * Generates questions using contract payload:
   * @param {Object} contractPayload - { topic, subject?, bloom_level, difficulty, question_type?, count? }
   * @param {string} userId - current user id
   * @param {{timeout?: number, signal?: AbortSignal}} [options] - deadline in ms
   *   (default 60s) and an optional caller signal, so a run can be cancelled
   * @returns {Promise<{ questions: Array }>}
   *
   * A failure is rethrown with the sentence its code maps to (api/errorMessages.js),
   * so a caller can hand the error straight to ErrorState or Toast without ever
   * showing a code: the message is friendly, and `retryable` says whether a
   * Retry button is honest. The backend's status and body stay on the error.
   */
  async generate(contractPayload, userId, { timeout = GENERATE_TIMEOUT_MS, signal } = {}) {
    if (isMocked('questions')) {
      await delay(250)
      return createMockQuestions(contractPayload)
    }

    const backendPayload = adaptGenerateQuestionsRequest(contractPayload, userId)

    try {
      const backendResponse = await apiFetch('/questions/generate', {
        method: 'POST',
        body: JSON.stringify(backendPayload),
        signal: deadlineSignal(timeout, signal),
      })

      return adaptGenerateQuestionsResponse(backendResponse)
    } catch (error) {
      throw toFriendlyGenerationError(error)
    }
  },
}

export const questionsApi = questionsEndpoints
