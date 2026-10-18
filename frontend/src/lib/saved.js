/**
 * saved — the courses a student has bookmarked.
 *
 * Kept per user in localStorage under `qm_saved_<userId>`. A bookmark is a note
 * to self ("come back to this"), so it is deliberately separate from enrollment:
 * a course can be saved without being started, and removed from My courses
 * without losing its bookmark.
 *
 *   { version: 1, courseIds: ["operating-systems", ...] }
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY_PREFIX = 'qm_saved_'
const VERSION = 1
const ANONYMOUS = 'anonymous'

const canStore = typeof window !== 'undefined' && Boolean(window.localStorage)

function keyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || ANONYMOUS}`
}

function emptySaved() {
  return { version: VERSION, courseIds: [] }
}

export function readSaved(userId) {
  if (!canStore) return emptySaved()
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return emptySaved()
    const parsed = JSON.parse(raw)
    return {
      version: parsed.version ?? VERSION,
      courseIds: Array.isArray(parsed.courseIds) ? parsed.courseIds : [],
    }
  } catch {
    return emptySaved()
  }
}

function writeSaved(userId, saved) {
  if (!canStore) return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(saved))
  } catch {
    // Storage full or blocked: the in-memory caller keeps what it has.
  }
}

const listeners = new Set()
const snapshots = new Map()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshotFor(userId) {
  if (!snapshots.has(userId)) snapshots.set(userId, readSaved(userId))
  return snapshots.get(userId)
}

function emit(userId) {
  snapshots.delete(userId)
  for (const listener of listeners) listener()
}

/** Add the bookmark if it is absent, remove it if it is present. */
export function toggleSaved(userId, courseId) {
  if (!courseId) return false
  const saved = readSaved(userId)
  const present = saved.courseIds.includes(courseId)
  const courseIds = present
    ? saved.courseIds.filter((id) => id !== courseId)
    : [...saved.courseIds, courseId]

  writeSaved(userId, { version: VERSION, courseIds })
  emit(userId)
  return !present
}

export function isSaved(userId, courseId) {
  return readSaved(userId).courseIds.includes(courseId)
}

export function listSaved(userId) {
  return readSaved(userId).courseIds
}

/** The saved course ids for a user, re-read whenever a bookmark is toggled. */
export function useSaved(userId) {
  const getSnapshot = () => snapshotFor(userId)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
