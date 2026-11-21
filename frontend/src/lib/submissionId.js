/**
 * Stable per-answer idempotency key.
 *
 * One answer submission gets ONE id. StrictMode double-invokes, React re-renders,
 * double clicks and network retries all reuse it, so the backend never counts
 * the same answer twice. A different answer/question gets a different id.
 */

const PREFIX = 'qm:submission:'

function keyFor(questionId, answerText) {
  const raw = `${questionId}\u0000${answerText}`
  let hash = 2166136261 // FNV-1a, just to keep sessionStorage keys short
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${PREFIX}${(hash >>> 0).toString(16)}`
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Only reached in non-secure legacy contexts; still unique per call.
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getSubmissionId(questionId, answerText) {
  const key = keyFor(questionId, answerText)
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = newId()
    sessionStorage.setItem(key, id)
  }
  return id
}

export function clearSubmissionId(questionId, answerText) {
  sessionStorage.removeItem(keyFor(questionId, answerText))
}
