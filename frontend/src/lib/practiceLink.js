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

function param(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * @param {{topic?: string, concept?: string, count?: number}} options
 * @returns {string} the /practice/new URL, with only the parameters we have
 *
 * `topic` and `concept` are content ids, so the link keeps working when a title
 * is reworded. The setup form still resolves a title, for links written before
 * the ids were passed.
 */
export function practiceLink({ topic, concept, count } = {}) {
  const params = new URLSearchParams()
  const topicName = param(topic)
  const conceptId = param(concept)
  if (topicName) params.set('topic', topicName)
  if (conceptId) params.set('concept', conceptId)
  if (count != null && count !== '') params.set('count', String(clampPracticeCount(count)))
  const query = params.toString()
  return query ? `/practice/new?${query}` : '/practice/new'
}
