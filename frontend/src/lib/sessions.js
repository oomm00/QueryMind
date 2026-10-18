/**
 * sessions — a student's practice sessions, kept per user in localStorage.
 *
 * A session is durable, not a tab: it survives a refresh and a closed browser,
 * and it is what the practice home resumes. Every change is written straight
 * away, so leaving mid-question loses nothing.
 *
 *   { version: 1, sessions: [ session, ... ] }
 *
 * A session stores the ids of the questions it drew, not the questions
 * themselves: the content files are the source of truth, so a session can be
 * resolved against them and the stored record stays small. The last 20 sessions
 * are kept, newest first.
 *
 * Mastery is not written here. Only scored answers move it, and the results
 * page is what turns a submitted mcq (or a marked short answer) into a score —
 * see recordScore in masteryStore.js.
 */

import { useSyncExternalStore } from 'react'

const STORAGE_KEY_PREFIX = 'qm_sessions_'
const VERSION = 1
const LIMIT = 20
const ANONYMOUS = 'anonymous'

export const SESSION_STATUS = { inProgress: 'in_progress', submitted: 'submitted' }

const canStore = typeof window !== 'undefined' && Boolean(window.localStorage)

function keyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || ANONYMOUS}`
}

function emptySessions() {
  return { version: VERSION, sessions: [] }
}

export function readSessions(userId) {
  if (!canStore) return emptySessions()
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return emptySessions()
    const parsed = JSON.parse(raw)
    return {
      version: parsed.version ?? VERSION,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    }
  } catch {
    return emptySessions()
  }
}

function writeSessions(userId, sessions) {
  if (!canStore) return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(sessions))
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
  if (!snapshots.has(userId)) snapshots.set(userId, readSessions(userId))
  return snapshots.get(userId)
}

function emit(userId) {
  snapshots.delete(userId)
  for (const listener of listeners) listener()
}

/** A fresh id for a session. */
export function newSessionId() {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `ses_${random}`
}

/** The shape a new session starts from, so every writer agrees on the fields. */
export function newSession({
  id = newSessionId(),
  courseId = null,
  scope = 'course',
  scopeId = null,
  level = 'mixed',
  questionIds = [],
  note = '',
} = {}) {
  return {
    id,
    courseId,
    scope,
    scopeId,
    level,
    createdAt: new Date().toISOString(),
    status: SESSION_STATUS.inProgress,
    questionIds: [...questionIds],
    answers: {},
    flagged: [],
    selfMarks: {},
    note,
  }
}

/** Write a whole session record: upsert it, move it to the front, keep 20. */
export function saveSession(userId, session) {
  if (!session?.id) return null
  const { sessions } = readSessions(userId)
  const others = sessions.filter((item) => item.id !== session.id)
  const next = [session, ...others].slice(0, LIMIT)
  writeSessions(userId, { version: VERSION, sessions: next })
  emit(userId)
  return session
}

export function getSession(userId, id) {
  return readSessions(userId).sessions.find((session) => session.id === id) ?? null
}

/** Apply a change to one stored session, leaving the rest untouched. */
export function patchSession(userId, id, patch) {
  const { sessions } = readSessions(userId)
  let found = null
  const next = sessions.map((session) => {
    if (session.id !== id) return session
    found = { ...session, ...(typeof patch === 'function' ? patch(session) : patch) }
    return found
  })
  if (!found) return null
  writeSessions(userId, { version: VERSION, sessions: next })
  emit(userId)
  return found
}

export function recordAnswer(userId, id, questionId, answer) {
  if (!questionId) return null
  return patchSession(userId, id, (session) => ({
    answers: { ...session.answers, [questionId]: answer },
  }))
}

export function recordSelfMark(userId, id, questionId, mark) {
  if (!questionId) return null
  return patchSession(userId, id, (session) => ({
    selfMarks: { ...session.selfMarks, [questionId]: mark },
  }))
}

/** Drop a question's answer entirely - the Clear answer action. */
export function clearAnswer(userId, id, questionId) {
  if (!questionId) return null
  return patchSession(userId, id, (session) => {
    const answers = { ...session.answers }
    delete answers[questionId]
    return { answers }
  })
}

export function toggleFlag(userId, id, questionId) {
  if (!questionId) return null
  return patchSession(userId, id, (session) => ({
    flagged: session.flagged.includes(questionId)
      ? session.flagged.filter((value) => value !== questionId)
      : [...session.flagged, questionId],
  }))
}

export function submitSession(userId, id) {
  return patchSession(userId, id, {
    status: SESSION_STATUS.submitted,
    submittedAt: new Date().toISOString(),
  })
}

// ── React binding ───────────────────────────────────────────

/** Every stored session for a user, newest first. */
export function useSessions(userId) {
  const getSnapshot = () => snapshotFor(userId)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).sessions
}

/** One stored session, re-read whenever it is written to. */
export function useStoredSession(userId, id) {
  const getSnapshot = () => snapshotFor(userId).sessions.find((s) => s.id === id) ?? null
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
