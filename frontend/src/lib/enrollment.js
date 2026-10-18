/**
 * enrollment — which courses a student has added to My courses.
 *
 * Kept per user in localStorage under `qm_enrolled_<userId>`. Enrolling is a
 * deliberate act that says "I am working on this"; it is not the same as having
 * answered a question, so enrolling never touches mastery, and unenrolling hides
 * the course from My courses without deleting a single answer.
 *
 * Adding a course is one click and one fact: the moment it was added. The
 * stored shape is:
 *
 *   { version: 1, courses: { [courseId]: { enrolledAt } } }
 *
 * Records written before that shape existed may still carry a `goal` or an
 * `examDate`. Nothing reads them any more, and enrolling again does not put
 * them back.
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY_PREFIX = 'qm_enrolled_'
const VERSION = 1
const ANONYMOUS = 'anonymous'

const canStore = typeof window !== 'undefined' && Boolean(window.localStorage)

function keyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || ANONYMOUS}`
}

function emptyEnrollments() {
  return { version: VERSION, courses: {} }
}

/** The stored enrollments for a user, or an empty map when there is nothing. */
export function readEnrollments(userId) {
  if (!canStore) return emptyEnrollments()
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return emptyEnrollments()
    const parsed = JSON.parse(raw)
    return {
      version: parsed.version ?? VERSION,
      courses: parsed.courses ?? {},
    }
  } catch {
    return emptyEnrollments()
  }
}

function writeEnrollments(userId, enrollments) {
  if (!canStore) return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(enrollments))
  } catch {
    // Storage full or blocked: the in-memory caller keeps what it has.
  }
}

// ── Subscription, for the React binding ─────────────────────

const listeners = new Set()
const snapshots = new Map()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshotFor(userId) {
  if (!snapshots.has(userId)) snapshots.set(userId, readEnrollments(userId))
  return snapshots.get(userId)
}

function emit(userId) {
  snapshots.delete(userId)
  for (const listener of listeners) listener()
}

// ── Writes ──────────────────────────────────────────────────

/**
 * Add a course to My courses, in one click. Enrolling again changes nothing:
 * a course is either in My courses or it is not.
 */
export function enroll(userId, courseId) {
  if (!courseId) return null
  const enrollments = readEnrollments(userId)
  const existing = enrollments.courses[courseId]
  if (existing) return existing

  const record = { enrolledAt: new Date().toISOString() }
  writeEnrollments(userId, {
    version: VERSION,
    courses: { ...enrollments.courses, [courseId]: record },
  })
  emit(userId)
  return record
}

/** Remove a course from My courses. Answers and mastery are untouched. */
export function unenroll(userId, courseId) {
  const enrollments = readEnrollments(userId)
  if (!enrollments.courses[courseId]) return
  const courses = { ...enrollments.courses }
  delete courses[courseId]
  writeEnrollments(userId, { version: VERSION, courses })
  emit(userId)
}

export function isEnrolled(userId, courseId) {
  return Boolean(readEnrollments(userId).courses[courseId])
}

/** The enrolled courses, with the moment each was added. */
export function listEnrolled(userId) {
  const { courses } = readEnrollments(userId)
  return Object.entries(courses).map(([courseId, record]) => ({ courseId, ...record }))
}

// ── React binding ───────────────────────────────────────────

/** The enrollments for a user, re-read whenever one is added or removed. */
export function useEnrollments(userId) {
  const getSnapshot = () => snapshotFor(userId)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
