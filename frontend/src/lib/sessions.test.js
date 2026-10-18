/**
 * sessions — the durable record a practice session is written to: the last 20
 * per user, newest first, and the small writes (an answer, a flag, a self-mark,
 * a submit) that never lose the rest.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAnswer,
  getSession,
  newSession,
  patchSession,
  readSessions,
  recordAnswer,
  recordSelfMark,
  saveSession,
  submitSession,
  toggleFlag,
  SESSION_STATUS,
} from './sessions.js'

const USER = 'test-user'

function make(id, extra = {}) {
  return { ...newSession({ id, courseId: 'os', scopeId: 't1', questionIds: ['q1'] }), ...extra }
}

describe('newSession', () => {
  it('starts in progress, empty and unanswered', () => {
    const session = newSession({ id: 's1', courseId: 'os', scope: 'topic', scopeId: 't1' })
    expect(session).toMatchObject({
      id: 's1',
      courseId: 'os',
      scope: 'topic',
      scopeId: 't1',
      level: 'mixed',
      status: SESSION_STATUS.inProgress,
      answers: {},
      flagged: [],
      selfMarks: {},
    })
    expect(session.createdAt).toEqual(expect.any(String))
  })
})

describe('saveSession', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps the newest first and the last twenty only', () => {
    for (let index = 0; index < 25; index += 1) {
      saveSession(USER, make(`s${index}`))
    }

    const { sessions } = readSessions(USER)
    expect(sessions).toHaveLength(20)
    expect(sessions[0].id).toBe('s24')
    expect(sessions[19].id).toBe('s5')
  })

  it('replaces a session in place rather than duplicating it', () => {
    saveSession(USER, make('s1'))
    saveSession(USER, { ...make('s1'), note: 'changed' })

    const { sessions } = readSessions(USER)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].note).toBe('changed')
  })
})

describe('writes to one session', () => {
  beforeEach(() => {
    window.localStorage.clear()
    saveSession(USER, make('s1'))
  })

  it('records an answer without losing the others', () => {
    recordAnswer(USER, 's1', 'q1', { selected: 1 })
    recordAnswer(USER, 's1', 'q2', { text: 'hello' })

    expect(getSession(USER, 's1').answers).toEqual({
      q1: { selected: 1 },
      q2: { text: 'hello' },
    })
  })

  it('clears one answer without touching the rest', () => {
    recordAnswer(USER, 's1', 'q1', { selected: 1 })
    recordAnswer(USER, 's1', 'q2', { text: 'hello' })
    clearAnswer(USER, 's1', 'q1')

    expect(getSession(USER, 's1').answers).toEqual({ q2: { text: 'hello' } })
  })

  it('toggles a flag on and off', () => {
    toggleFlag(USER, 's1', 'q1')
    expect(getSession(USER, 's1').flagged).toEqual(['q1'])

    toggleFlag(USER, 's1', 'q1')
    expect(getSession(USER, 's1').flagged).toEqual([])
  })

  it('records a self-mark', () => {
    recordSelfMark(USER, 's1', 'q3', { score: 0.5, earned: 2, total: 4, metIndexes: [0] })
    expect(getSession(USER, 's1').selfMarks.q3).toMatchObject({ score: 0.5 })
  })

  it('marks the session submitted', () => {
    submitSession(USER, 's1')
    expect(getSession(USER, 's1').status).toBe(SESSION_STATUS.submitted)
    expect(getSession(USER, 's1').submittedAt).toEqual(expect.any(String))
  })

  it('leaves a missing session alone', () => {
    expect(patchSession(USER, 'nope', { note: 'x' })).toBeNull()
    expect(readSessions(USER).sessions).toHaveLength(1)
  })
})

describe('per user', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps each user own sessions', () => {
    saveSession(USER, make('s1'))
    saveSession('other-user', make('s2'))

    expect(readSessions(USER).sessions.map((s) => s.id)).toEqual(['s1'])
    expect(readSessions('other-user').sessions.map((s) => s.id)).toEqual(['s2'])
  })

  it('starts empty and survives malformed storage', () => {
    expect(readSessions('nobody')).toEqual({ version: 1, sessions: [] })
    window.localStorage.setItem('qm_sessions_test-user', '{not json')
    expect(readSessions(USER)).toEqual({ version: 1, sessions: [] })
  })
})
