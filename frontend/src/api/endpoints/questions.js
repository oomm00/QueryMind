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

export const questionsEndpoints = {
  /**
   * Generates questions using contract payload:
   * @param {Object} contractPayload - { topic, subject?, bloom_level, difficulty, question_type?, count? }
   * @param {string} userId - current user id
   * @returns {Promise<{ questions: Array }>}
   */
  async generate(contractPayload, userId) {
    if (isMocked('questions')) {
      await delay(250)
      return createMockQuestions(contractPayload)
    }

    const backendPayload = adaptGenerateQuestionsRequest(contractPayload, userId)
    const backendResponse = await apiFetch('/questions/generate', {
      method: 'POST',
      body: JSON.stringify(backendPayload),
    })

    return adaptGenerateQuestionsResponse(backendResponse)
  },
}
