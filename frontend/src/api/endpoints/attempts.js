/**
 * Attempts Endpoints
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { createMockAttemptFeedback } from '../mocks/data/attempts.mock.js'
import { createMockHistory } from '../mocks/data/extended.mock.js'
import {
  adaptSubmitAttemptRequest,
  adaptSubmitAttemptResponse,
} from '../adapter.js'

export const attemptsEndpoints = {
  /**
   * Submits an answer using contract shape
   * @param {Object} contractPayload - { question_id, answer_text, time_taken_seconds? }
   * @param {string} userId - current user id
   * @returns {Promise<{ score: number, criteria_scores?: Object, feedback_text: string, correct_answer?: string }>}
   */
  async submit(contractPayload, userId) {
    if (isMocked('attempts')) {
      await delay(250)
      return createMockAttemptFeedback(contractPayload)
    }

    const backendPayload = adaptSubmitAttemptRequest(contractPayload, userId)
    const backendResponse = await apiFetch('/attempts/submit', {
      method: 'POST',
      body: JSON.stringify(backendPayload),
    })

    return adaptSubmitAttemptResponse(backendResponse)
  },

  /**
   * Fetches attempt history for user
   */
  async getHistory(userId) {
    if (isMocked('history')) {
      await delay(250)
      return createMockHistory(userId)
    }

    return apiFetch(`/attempts/history/${userId}`, {
      method: 'GET',
    })
  },
}

export const attemptsApi = attemptsEndpoints
