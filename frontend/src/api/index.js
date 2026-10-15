/**
 * Unified API Entry Point
 */

export * from './client.js'
export * from './adapter.js'
export { authEndpoints, authApi } from './endpoints/auth.js'
export { questionsEndpoints, questionsApi } from './endpoints/questions.js'
export { attemptsEndpoints, attemptsApi } from './endpoints/attempts.js'
export { profileEndpoints, profileApi } from './endpoints/profile.js'
export { documentsEndpoints, documentsApi } from './endpoints/documents.js'
