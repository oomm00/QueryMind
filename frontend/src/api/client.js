/**
 * API Client — QueryMind Frontend
 * ================================
 * A thin fetch wrapper that:
 *  - Prefixes every request with the backend base URL from env
 *  - Attaches JSON Content-Type and Authorization headers
 *  - Throws a structured error on non-2xx responses
 *
 * Replace BASE_URL env var in .env.local:
 *   VITE_API_BASE_URL=http://localhost:8000
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Retrieve the stored auth token (stub: returns null until auth is real). */
function getToken() {
  return localStorage.getItem('qm_token')
}

/**
 * Core fetch wrapper.
 * @param {string} path - API path, e.g. '/auth/login'
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} - Parsed JSON response
 */
async function apiFetch(path, options = {}) {
  const token = getToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = { detail: response.statusText }
    }
    throw new ApiError(response.status, errorData?.detail ?? 'Unknown error', errorData)
  }

  // 204 No Content
  if (response.status === 204) return null

  return response.json()
}

/** Structured API error */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

// ── Auth ────────────────────────────────────────────────────

export const authApi = {
  register: (payload) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
}

// ── Questions ────────────────────────────────────────────────

export const questionsApi = {
  generate: (payload) =>
    apiFetch('/questions/generate', { method: 'POST', body: JSON.stringify(payload) }),
}

// ── Attempts ─────────────────────────────────────────────────

export const attemptsApi = {
  submit: (payload) =>
    apiFetch('/attempts/submit', { method: 'POST', body: JSON.stringify(payload) }),
}

// ── Profile ──────────────────────────────────────────────────

export const profileApi = {
  get: (userId) => apiFetch(`/profile/${userId}`),
}
