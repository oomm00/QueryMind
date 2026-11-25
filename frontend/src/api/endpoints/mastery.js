/**
 * Mastery Endpoints — /mastery
 * Fetches the authenticated learner's mastery profile.
 */

import { apiFetch } from '../client.js'

export const masteryEndpoints = {
  /**
   * Fetches current user's mastery records from GET /mastery/me
   * @param {Object} [params] - optional filters { subject, topic }
   * @returns {Promise<Array<{ subject: string, topic: string, mastery_score: number, attempts_count: number, bloom_breakdown: Object, last_updated: string }>>}
   */
  async getMyMastery(params = {}) {
    const searchParams = new URLSearchParams()
    if (params.subject) searchParams.set('subject', params.subject)
    if (params.topic) searchParams.set('topic', params.topic)
    const query = searchParams.toString()
    const url = `/mastery/me${query ? `?${query}` : ''}`
    return apiFetch(url, { method: 'GET' })
  },
}

export const masteryApi = masteryEndpoints
