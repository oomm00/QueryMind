/**
 * masteryHistory — one snapshot per day, per user.
 *
 * Mastery is a moving estimate; this keeps the shape of the movement. Every
 * time a scored answer changes a stored value, the day's snapshot is rewritten
 * from the estimates as they now stand, so the day's row is "where mastery was
 * at the end of that day", not a running total.
 *
 * Kept per user in localStorage under `qm_mastery_history_<userId>`:
 *
 *   { version: 1,
 *     days: { "2026-10-18": { subjects: { [slug]: mean },
 *                            courses:  { [courseId]: mean },
 *                            concepts: { [conceptId]: mean } } } }
 *
 * The means are the same ones the pages show: a concept's mean over the Bloom
 * levels it has answers at, a subject's or course's mean over the concepts in
 * it that have an estimate. A concept with no answers is absent rather than
 * zero — the one rule mastery never breaks.
 *
 * 180 days are kept; older days fall off the front.
 */

import { estimatesFrom } from './mastery.js'
import { registry } from '../content/registry.js'

const STORAGE_KEY_PREFIX = 'qm_mastery_history_'
const VERSION = 1

/** How many daily rows to keep. */
export const KEEP_DAYS = 180

const ANONYMOUS = 'anonymous'

const canStore = typeof window !== 'undefined' && Boolean(window.localStorage)

function keyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || ANONYMOUS}`
}

function emptyHistory() {
  return { version: VERSION, days: {} }
}

/** The local calendar date of a moment, as YYYY-MM-DD. */
export function historyDate(when = Date.now()) {
  const date = new Date(when)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The stored history for a user, or an empty one when there is nothing readable. */
export function readHistory(userId) {
  if (!canStore) return emptyHistory()
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return emptyHistory()
    const parsed = JSON.parse(raw)
    return {
      version: parsed.version ?? VERSION,
      days: parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
    }
  } catch {
    return emptyHistory()
  }
}

function writeHistory(userId, history) {
  if (!canStore) return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(history))
  } catch {
    // Storage full or blocked: the caller keeps what it has.
  }
}

/**
 * Rewrite today's row from the concepts as they now stand. Called from the one
 * place mastery moves (recordScore), so a snapshot cannot drift from the store.
 */
export function recordMasterySnapshot(userId, concepts = {}, when = Date.now()) {
  const estimates = estimatesFrom(concepts)

  const conceptMeans = {}
  for (const [conceptId, estimate] of Object.entries(estimates)) {
    conceptMeans[conceptId] = estimate.value
  }

  const subjectMeans = {}
  for (const subject of registry.subjects()) {
    const value = registry.subjectMastery(estimates, subject).value
    if (value != null) subjectMeans[subject] = value
  }

  const courseMeans = {}
  for (const course of registry.courses()) {
    const value = registry.courseMastery(estimates, course.id).value
    if (value != null) courseMeans[course.id] = value
  }

  const date = historyDate(when)
  const day = { subjects: subjectMeans, courses: courseMeans, concepts: conceptMeans }

  const days = { ...readHistory(userId).days, [date]: day }
  const kept = Object.keys(days).sort().slice(-KEEP_DAYS)
  const trimmed = {}
  for (const keptDate of kept) trimmed[keptDate] = days[keptDate]

  writeHistory(userId, { version: VERSION, days: trimmed })
  return { date, ...day }
}

/** Forget a user's history, as resetMastery forgets their progress. */
export function resetHistory(userId) {
  if (!canStore) return
  try {
    window.localStorage.removeItem(keyFor(userId))
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** The day's row for a user, or null. */
export function historyFor(userId, date = historyDate()) {
  return readHistory(userId).days[date] ?? null
}
