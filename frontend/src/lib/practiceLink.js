/**
 * practiceLink — the one place that knows how to ask for a practice session.
 *
 * The setup form reads the same parameter names back, so a link from anywhere in
 * the app (a check on a concept, a weak prerequisite) lands on a prepared form
 * rather than an empty one.
 */

export const DEFAULT_PRACTICE_COUNT = 5
export const MIN_PRACTICE_COUNT = 1
export const MAX_PRACTICE_COUNT = 10

/** Clamp a question count to the range the form accepts. */
export function clampPracticeCount(value, fallback = DEFAULT_PRACTICE_COUNT) {
  const count = Number.parseInt(value, 10)
  if (Number.isNaN(count)) return fallback
  return Math.min(MAX_PRACTICE_COUNT, Math.max(MIN_PRACTICE_COUNT, count))
}

/**
 * @param {{topic?: string, count?: number}} options
 * @returns {string} the /practice/new URL, with only the parameters we have
 */
export function practiceLink({ topic, count } = {}) {
  const params = new URLSearchParams()
  const name = typeof topic === 'string' ? topic.trim() : ''
  if (name) params.set('topic', name)
  if (count != null && count !== '') params.set('count', String(clampPracticeCount(count)))
  const query = params.toString()
  return query ? `/practice/new?${query}` : '/practice/new'
}
