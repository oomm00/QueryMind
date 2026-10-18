/**
 * enrollment — which courses a student has added to My courses.
 *
 * Kept per user in localStorage under `qm_enrolled_<userId>`. Enrolling is a
 * deliberate act that says "I am working on this"; it is not the same as having
 * answered a question, so enrolling never touches mastery, and unenrolling hides
 * the course from My courses without deleting a single answer.
 *
 * The stored shape is:
 *
 *   { version: 1, courses: { [courseId]: { enrolledAt, goal, examDate } } }
 *
 * `goal` and `examDate` are optional: a student may enrol from a Start button
 * without saying anything, and About offers to fill them in later.
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
 * Add a course to My courses. Enrolling twice is a no-op beyond filling in a
 * goal or an exam date that has since been given.
 */
export function enroll(userId, courseId, { goal, examDate } = {}) {
  if (!courseId) return null
  const enrollments = readEnrollments(userId)
  const existing = enrollments.courses[courseId]
  const record = existing
    ? {
        ...existing,
        ...(goal !== undefined ? { goal: String(goal) } : {}),
        ...(examDate !== undefined ? { examDate: String(examDate) } : {}),
      }
    : {
        enrolledAt: new Date().toISOString(),
        goal: goal !== undefined ? String(goal) : '',
        examDate: examDate !== undefined ? String(examDate) : '',
      }

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

/** Change the goal or the exam date of a course already in My courses. */
export function updateEnrollment(userId, courseId, { goal, examDate } = {}) {
  const enrollments = readEnrollments(userId)
  const existing = enrollments.courses[courseId]
  if (!existing) return null

  const record = { ...existing }
  if (goal !== undefined) record.goal = String(goal)
  if (examDate !== undefined) record.examDate = String(examDate)

  writeEnrollments(userId, {
    version: VERSION,
    courses: { ...enrollments.courses, [courseId]: record },
  })
  emit(userId)
  return record
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
