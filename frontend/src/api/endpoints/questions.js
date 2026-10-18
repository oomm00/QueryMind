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

export const questionsEndpoints = {
  /**
   * Generates questions using contract payload:
   * @param {Object} contractPayload - { topic, subject?, bloom_level, difficulty, question_type?, count? }
   * @param {string} userId - current user id
   * @returns {Promise<{ questions: Array }>}
   *
   * A failure is rethrown with the sentence its code maps to (api/errorMessages.js),
   * so a caller can hand the error straight to ErrorState or Toast without ever
   * showing a code: the message is friendly, and `retryable` says whether a
   * Retry button is honest. The backend's status and body stay on the error.
   */
  async generate(contractPayload, userId) {
    if (isMocked('questions')) {
      await delay(250)
      return createMockQuestions(contractPayload)
    }

    const backendPayload = adaptGenerateQuestionsRequest(contractPayload, userId)

    try {
      const backendResponse = await apiFetch('/questions/generate', {
        method: 'POST',
        body: JSON.stringify(backendPayload),
      })

      return adaptGenerateQuestionsResponse(backendResponse)
    } catch (error) {
      throw toFriendlyGenerationError(error)
    }
  },
}

export const questionsApi = questionsEndpoints
