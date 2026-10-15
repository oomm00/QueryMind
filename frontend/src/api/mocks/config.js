/**
 * Mock API Configuration & Dispatcher
 * Determines whether an endpoint should use mock data or call the real backend.
 */

export const DEFAULT_MOCK_SETTINGS = {
  auth: false,
  questions: true,
  attempts: true,
  documents: true,
  profile_goal: true,
  next_params: true,
  profile: true,
  history: true,
}

/**
 * Checks if a specific domain endpoint is configured to use mocks.
 * Order of precedence:
 * 1. Global master toggle VITE_USE_MOCKS === 'true'
 * 2. Explicit per-endpoint flag VITE_MOCK_<DOMAIN> (e.g. VITE_MOCK_QUESTIONS)
 * 3. Default fallback setting
 *
 * @param {string} domain - Domain key ('auth' | 'questions' | 'attempts' | 'documents' | 'profile_goal' | 'next_params' | 'profile' | 'history')
 * @returns {boolean}
 */
export function isMocked(domain) {
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    return true
  }

  const envKey = `VITE_MOCK_${domain.toUpperCase()}`
  const envVal = import.meta.env[envKey]

  if (envVal !== undefined) {
    return envVal === 'true'
  }

  return DEFAULT_MOCK_SETTINGS[domain] ?? false
}

/**
 * Simulates network latency (250ms default)
 */
export function delay(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
