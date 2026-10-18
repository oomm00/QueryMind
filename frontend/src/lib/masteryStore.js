/**
 * masteryStore — per-user mastery, kept in localStorage under qm_progress_<userId>.
 *
 * Mastery is only ever moved by a scored answer: `recordScore` is the single
 * write path, called from the practice flow, where a score is produced. Reading
 * a study note, opening a resource or marking a note as reviewed never touches
 * this store — completion is a separate concern (lessonProgress.js).
 *
 * The stored shape is flat and keyed by content ids, so a roll-up can be taken
 * over any set of concepts without this module knowing the course tree:
 *
 *   { version: 1,
 *     concepts: { [conceptId]: { [bloom]: { value, count, updatedAt } } },
 *     applied:  { "sessionId:questionId": true } }
 *
 * A question answered twice moves mastery once. The caller passes the session
 * and question it is scoring, and the write is remembered under
 * `sessionId:questionId`: submitting the same session again, or re-marking a
 * short answer, changes nothing. Answers that are not scored (an unanswered
 * question, a short answer nobody marked yet) never reach here at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addScore, estimatesFrom } from './mastery.js'
import { recordMasterySnapshot, resetHistory } from './masteryHistory.js'

const STORAGE_KEY_PREFIX = 'qm_progress_'
const VERSION = 1
const ANONYMOUS = 'anonymous'

/** How many applied (session, question) keys to remember before pruning. */
const APPLIED_LIMIT = 1000

const canStore = typeof window !== 'undefined' && Boolean(window.localStorage)

const listeners = new Set()

function keyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || ANONYMOUS}`
}

function emptyProgress() {
  return { version: VERSION, concepts: {}, applied: {} }
}

/** The stored progress for a user, or an empty one when there is nothing. */
export function readProgress(userId) {
  if (!canStore) return emptyProgress()
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw)
    return {
      version: parsed.version ?? VERSION,
      concepts: parsed.concepts ?? {},
      applied: parsed.applied ?? {},
    }
  } catch {
    return emptyProgress()
  }
}

function writeProgress(userId, progress) {
  if (!canStore) return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(progress))
  } catch {
    // Storage full or blocked: the in-memory caller keeps what it has.
  }
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(userId) {
  const key = userId || ANONYMOUS
  for (const listener of listeners) listener(key)
}

/** Keep the applied map bounded: the oldest keys fall off first. */
function pruneApplied(applied) {
  const keys = Object.keys(applied)
  if (keys.length <= APPLIED_LIMIT) return applied
  const trimmed = {}
  for (const key of keys.slice(keys.length - APPLIED_LIMIT)) trimmed[key] = true
  return trimmed
}

/**
 * Record one scored answer. Returns the new entry for that (concept, Bloom)
 * pair, or null when the answer had nothing to record.
 *
 * When `sessionId` and `questionId` are both given the write is idempotent:
 * scoring the same question in the same session again returns the entry it
 * already has and leaves the store untouched.
 *
 * @param {string} userId
 * @param {{conceptId?: string, bloom?: string, score?: number, when?: number,
 *          sessionId?: string, questionId?: string}} answer
 */
export function recordScore(
  userId,
  { conceptId, bloom, score, when, sessionId, questionId } = {}
) {
  if (!conceptId || !bloom) return null
  const progress = readProgress(userId)
  const appliedKey = sessionId && questionId ? `${sessionId}:${questionId}` : null
  if (appliedKey && progress.applied[appliedKey]) {
    return progress.concepts[conceptId]?.[bloom] ?? null
  }

  const concept = progress.concepts[conceptId] ?? {}
  const entry = addScore(concept[bloom], score, when ?? Date.now())
  if (!entry) return null

  const applied = appliedKey
    ? pruneApplied({ ...progress.applied, [appliedKey]: true })
    : progress.applied

  const next = {
    version: VERSION,
    concepts: { ...progress.concepts, [conceptId]: { ...concept, [bloom]: entry } },
    applied,
  }
  writeProgress(userId, next)
  // The day's snapshot is rewritten here, beside the write it describes.
  recordMasterySnapshot(userId, next.concepts)
  emit(userId)
  return entry
}

export function resetMastery(userId) {
  if (canStore) {
    try {
      window.localStorage.removeItem(keyFor(userId))
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
  resetHistory(userId)
  emit(userId)
}

// ── React binding ───────────────────────────────────────────

/** The stored progress for a user, re-read whenever a score is recorded. */
export function useProgress(userId) {
  const key = userId || ANONYMOUS
  const [progress, setProgress] = useState(() => readProgress(userId))

  const refresh = useCallback(() => setProgress(readProgress(userId)), [userId])

  useEffect(() => {
    refresh()
    return subscribe((changed) => {
      if (changed === key) refresh()
    })
  }, [key, refresh])

  return progress
}

/** The per-concept estimates for a user, in one call. */
export function useMastery(userId) {
  const progress = useProgress(userId)
  return useMemo(() => estimatesFrom(progress.concepts), [progress])
}
