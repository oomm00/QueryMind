/**
 * mastery — what a student can currently do, judged only by answers they gave.
 *
 * Pure functions only: no storage, no React, no content. masteryStore.js holds
 * the storage and calls these.
 *
 * The unit of storage is (userId, conceptId, Bloom level) → { value, count }.
 * One scored answer produces a 0–1 score; the value moves towards it but keeps
 * most of its history, because recent answers should matter without one bad day
 * erasing a concept. A concept's estimate is the mean of the Bloom levels
 * attempted, and a topic's or a course's estimate is the mean of the concepts
 * that have one — which is why every roll-up also reports how many concepts it
 * covers.
 *
 * The one rule that is not arithmetic: a concept with no scored answers has no
 * estimate at all, never 0%. `estimateFor` returns null and the UI says so.
 */

/** How much of a new score replaces the value it lands on. */
export const NEW_SCORE_WEIGHT = 0.3

/** Confidence bands, by the number of scored answers behind a concept. */
export const CONFIDENCE_LEVELS = [
  { id: 'high', label: 'High', min: 8 },
  { id: 'moderate', label: 'Moderate', min: 3 },
  { id: 'low', label: 'Low', min: 1 },
]

/** Keep a score inside 0–1, and treat a missing value as missing, not as 0. */
export function clamp01(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(1, Math.max(0, number))
}

/**
 * The value after one scored answer. The first answer is taken as it is; after
 * that the stored value keeps 70% of its weight.
 */
export function updateValue(previous, score) {
  const next = clamp01(score)
  if (next == null) return clamp01(previous)
  const old = clamp01(previous)
  if (old == null) return next
  return NEW_SCORE_WEIGHT * next + (1 - NEW_SCORE_WEIGHT) * old
}

/** The stored entry for one Bloom level after one more scored answer. */
export function addScore(entry, score, when = Date.now()) {
  const next = updateValue(entry?.value ?? null, score)
  if (next == null) return entry ?? null
  return {
    value: next,
    count: (Number(entry?.count) || 0) + 1,
    updatedAt: new Date(when).toISOString(),
  }
}

/** The confidence band for a number of scored answers, or null when none. */
export function confidenceFor(count = 0) {
  const total = Number(count) || 0
  if (total <= 0) return null
  return CONFIDENCE_LEVELS.find((level) => total >= level.min) ?? CONFIDENCE_LEVELS[CONFIDENCE_LEVELS.length - 1]
}

function entriesOf(entry) {
  return Object.entries(entry ?? {}).filter(([, value]) => value && clamp01(value.value) != null)
}

/**
 * One concept's estimate, over the Bloom levels it has been practised at, or
 * null when the concept has no scored answers at all.
 */
export function estimateFor(entry) {
  const blooms = entriesOf(entry)
  if (blooms.length === 0) return null

  const value = blooms.reduce((sum, [, item]) => sum + clamp01(item.value), 0) / blooms.length
  const count = blooms.reduce((sum, [, item]) => sum + (Number(item.count) || 0), 0)
  const updatedAt = blooms
    .map(([, item]) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  return {
    value,
    count,
    bloomCount: blooms.length,
    bloomValues: Object.fromEntries(blooms.map(([level, item]) => [level, clamp01(item.value)])),
    confidence: confidenceFor(count),
    updatedAt,
  }
}

/** Every concept estimate in a stored progress map, by concept id. */
export function estimatesFrom(concepts = {}) {
  const estimates = {}
  for (const [conceptId, entry] of Object.entries(concepts ?? {})) {
    const estimate = estimateFor(entry)
    if (estimate) estimates[conceptId] = estimate
  }
  return estimates
}

/**
 * A topic's or a course's estimate over a set of concepts: the mean of the
 * concepts that have an estimate. Returns null when none of them do.
 */
export function rollUp(estimateById = {}, conceptIds = []) {
  const known = (conceptIds ?? [])
    .map((id) => estimateById[id])
    .filter((estimate) => estimate && clamp01(estimate.value) != null)
  if (known.length === 0) return null

  const value = known.reduce((sum, estimate) => sum + clamp01(estimate.value), 0) / known.length
  const count = known.reduce((sum, estimate) => sum + (Number(estimate.count) || 0), 0)

  return {
    value,
    count,
    basedOn: known.length,
    of: conceptIds.length,
    confidence: confidenceFor(count),
  }
}
