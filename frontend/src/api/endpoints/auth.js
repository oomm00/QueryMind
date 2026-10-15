/**
 * Auth Endpoints
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { mockTokenResponse, mockAuthUser } from '../mocks/data/auth.mock.js'

export const authEndpoints = {
  async register(payload) {
    if (isMocked('auth')) {
      await delay(250)
      return {
        ...mockTokenResponse,
        email: payload.email,
      }
    }
    return apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async login(payload) {
    if (isMocked('auth')) {
      await delay(250)
      return {
        ...mockTokenResponse,
        email: payload.email,
      }
    }
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getMe() {
    if (isMocked('auth')) {
      await delay(250)
      return mockAuthUser
    }
    return apiFetch('/auth/me', {
      method: 'GET',
    })
  },

  async refresh(refreshToken) {
    if (isMocked('auth')) {
      await delay(250)
      return mockTokenResponse
    }
    return apiFetch('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  },
}

export const authApi = authEndpoints
