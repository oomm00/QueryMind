/**
 * lessonProgress — per-session lesson completion and the reader's own check answers.
 *
 * Kept in sessionStorage, so progress is scoped to the browser session and is
 * discarded when the tab closes. It holds two separate records:
 *
 *   completed  the student marked the study note as reviewed
 *   checks     a check answered inside the reader, so the reader can show the
 *              verdict again when the lesson is re-opened
 *
 * Neither is mastery. Estimated mastery lives in lib/mastery.js and is stored per
 * user by lib/masteryStore.js; only a scored answer in practice moves it, so the
 * same check answered twice (once while reading, once in a session) cannot be
 * counted two different ways.
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

export function resetLessonProgress() {
  state = emptyState()
  commit()
}

// ── React binding ───────────────────────────────────────────

export function useLessonProgress() {
  return useSyncExternalStore(subscribeLessonProgress, getProgressSnapshot, getProgressSnapshot)
}
