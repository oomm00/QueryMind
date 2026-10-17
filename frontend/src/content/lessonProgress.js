/**
 * lessonProgress — per-session lesson completion and check-question results.
 *
 * Kept in sessionStorage, so progress is scoped to the browser session and is
 * discarded when the tab closes. Completion and estimated mastery are tracked
 * as separate concerns:
 *
 *   completion         the lesson was read and marked complete
 *   estimated mastery  the share of check questions answered correctly so far
 *
 * Mastery is derived from the recorded check results rather than stored
 * alongside them, so the two can never disagree.
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'qm.lesson-progress.v1'

const canStore = typeof window !== 'undefined' && Boolean(window.sessionStorage)

function emptyState() {
  return { completed: {}, checks: {} }
}

function read() {
  if (!canStore) return emptyState()
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    return {
      completed: parsed.completed ?? {},
      checks: parsed.checks ?? {},
    }
  } catch {
    return emptyState()
  }
}

let state = read()
const listeners = new Set()

function commit() {
  if (canStore) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked: keep the in-memory copy and carry on.
    }
  }
  for (const listener of listeners) listener()
}

export function subscribeLessonProgress(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getProgressSnapshot() {
  return state
}

// ── Completion ──────────────────────────────────────────────

export function completeLesson(lessonId) {
  if (!lessonId || state.completed[lessonId]) return
  state = {
    ...state,
    completed: { ...state.completed, [lessonId]: new Date().toISOString() },
  }
  commit()
}

export function isLessonComplete(lessonId) {
  return Boolean(state.completed[lessonId])
}

// ── Check results ───────────────────────────────────────────

export function recordCheck(lessonId, blockIndex, correct) {
  if (!lessonId || blockIndex == null) return
  const key = String(blockIndex)
  state = {
    ...state,
    checks: {
      ...state.checks,
      [lessonId]: { ...(state.checks[lessonId] ?? {}), [key]: Boolean(correct) },
    },
  }
  commit()
}

export function getCheckResult(lessonId, blockIndex) {
  const result = state.checks[lessonId]?.[String(blockIndex)]
  return typeof result === 'boolean' ? result : null
}

/** Share of a lesson's answered checks that were correct, or null if none. */
export function getLessonMastery(lessonId) {
  const results = Object.values(state.checks[lessonId] ?? {})
  if (results.length === 0) return null
  return results.filter(Boolean).length / results.length
}

/** Mean lesson mastery across a concept's lessons, or null if none answered. */
export function getConceptMastery(lessonIds = []) {
  const scores = lessonIds.map(getLessonMastery).filter((score) => score !== null)
  if (scores.length === 0) return null
  return scores.reduce((total, score) => total + score, 0) / scores.length
}

export function resetLessonProgress() {
  state = emptyState()
  commit()
}

// ── React binding ───────────────────────────────────────────

export function useLessonProgress() {
  return useSyncExternalStore(subscribeLessonProgress, getProgressSnapshot, getProgressSnapshot)
}
