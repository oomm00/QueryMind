/**
 * Core API Client — QueryMind Frontend
 * =====================================
 * Thin fetch wrapper supporting:
 *  - Configurable BASE_URL
 *  - Automatic JWT Authorization header injection from localStorage ('qm_token')
 *  - Structured ApiError exceptions
 *  - 401 Unauthorized observer hook for AuthContext integration
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// Registry of 401 callbacks (typically registered by AuthContext)
let unauthorizedCallbacks = []

export function onUnauthorized(callback) {
  unauthorizedCallbacks.push(callback)
  return () => {
    unauthorizedCallbacks = unauthorizedCallbacks.filter((cb) => cb !== callback)
  }
}

function notifyUnauthorized() {
  unauthorizedCallbacks.forEach((cb) => {
    try {
      cb()
    } catch (err) {
      console.error('Error in onUnauthorized callback', err)
    }
  })
}

/** Retrieve current token from storage */
export function getStoredToken() {
  return localStorage.getItem('qm_token')
}

/** Structured API Error */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/**
 * Core fetch wrapper
 * @param {string} path - API endpoint path, e.g. '/auth/login'
 * @param {RequestInit} options - fetch options
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}) {
  const token = getStoredToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  // Handle FormData where Content-Type must be determined by browser boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }

  const url = `${BASE_URL}${path}`
  let response

  try {
    response = await fetch(url, {
      ...options,
      headers,
    })
  } catch (err) {
    throw new ApiError(0, err.message || 'Network request failed', null)
  }

  if (response.status === 401) {
    notifyUnauthorized()
  }

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = { detail: response.statusText }
    }
    const message = errorData?.detail ?? errorData?.message ?? 'Request failed'
    throw new ApiError(response.status, message, errorData)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}
