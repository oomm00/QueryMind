/**
 * Profile & Recommendations Endpoints
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { createMockProfile } from '../mocks/data/profile.mock.js'
import { createMockProfileGoal, createMockNextParams } from '../mocks/data/extended.mock.js'

export const profileEndpoints = {
  /**
   * Fetches user profile with mastery breakdown
   */
  async getProfile(userId) {
    if (isMocked('profile')) {
      await delay(250)
      return createMockProfile(userId)
    }

    return apiFetch(`/profile/${userId}`, {
      method: 'GET',
    })
  },

  /**
   * Sets user learning goal: POST /profile/goal
   */
  async setGoal(payload, userId) {
    if (isMocked('profile_goal')) {
      await delay(250)
      return {
        user_id: userId,
        goal: payload.goal,
        target_date: payload.target_date,
      }
    }

    return apiFetch('/profile/goal', {
      method: 'POST',
      body: JSON.stringify({ ...payload, user_id: userId }),
    })
  },

  /**
   * Gets user learning goal: GET /profile/goal/{user_id}
   */
  async getGoal(userId) {
    if (isMocked('profile_goal')) {
      await delay(250)
      return createMockProfileGoal(userId)
    }

    return apiFetch(`/profile/goal/${userId}`, {
      method: 'GET',
    })
  },

  /**
   * Gets adaptive next question parameters: GET /next-question-params/{user_id}
   */
  async getNextQuestionParams(userId) {
    if (isMocked('next_params')) {
      await delay(250)
      return createMockNextParams(userId)
    }

    return apiFetch(`/next-question-params/${userId}`, {
      method: 'GET',
    })
  },
}
