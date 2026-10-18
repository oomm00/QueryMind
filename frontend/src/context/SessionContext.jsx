/**
 * SessionContext — study session state store.
 *
 * The session holds the questions drawn from the course bank, where the student
 * is in that list, the draft answer for the current question, and the result of
 * every question answered so far. It is kept in sessionStorage so refreshing
 * /practice/session or /practice/feedback never loses progress.
 *
 * Results are stored per question rather than summed, so the running score is
 * derived and the two can never disagree.
 */

import React, { createContext, useContext, useState, useEffect } from 'react'

const SessionContext = createContext(null)
const SESSION_STORAGE_KEY = 'qm_study_session'

function emptySession(setup, questions) {
  return {
    setup,
    questions,
    currentIdx: 0,
    userAnswer: '',
    answers: {},
    startedAt: Date.now(),
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // Synchronize state with sessionStorage
  useEffect(() => {
    try {
      if (session) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch (err) {
      console.warn('Failed to persist session to sessionStorage', err)
    }
  }, [session])

  /**
   * Initializes a new study session
   * @param {Object} setup - { goal, topic, concept, difficulty, count }
   * @param {Array} questions - questions drawn from the course bank
   */
  const initSession = (setup, questions = []) => {
    setSession(emptySession(setup, questions))
  }

  const setCurrentIdx = (idx) => {
    setSession((prev) => (prev ? { ...prev, currentIdx: idx, userAnswer: '' } : prev))
  }

  const setUserAnswer = (answer) => {
    setSession((prev) => (prev ? { ...prev, userAnswer: answer } : prev))
  }

  /**
   * Record one scored answer: the score, whether it was right, and whether the
   * student marked it themselves. Re-answering the same question replaces its
   * result instead of counting twice.
   */
  const recordAnswer = (result) => {
    setSession((prev) => {
      if (!prev) return prev
      const id = result.questionId
      if (!id) return prev
      return { ...prev, answers: { ...prev.answers, [id]: { ...result } } }
    })
  }

  const resetSession = () => {
    setSession(null)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }

  const answers = session?.answers ?? {}
  const results = Object.values(answers)
  const answeredCount = results.length
  const scoreTotal = results.reduce((sum, result) => sum + (Number(result.score) || 0), 0)

  const value = {
    session,
    hasActiveSession: Boolean(session && session.questions?.length > 0),
    setup: session?.setup ?? null,
    questions: session?.questions ?? [],
    currentIdx: session?.currentIdx ?? 0,
    currentQuestion: session?.questions?.[session?.currentIdx ?? 0] ?? null,
    userAnswer: session?.userAnswer ?? '',
    answers,
    answeredCount,
    scoreTotal,
    scorePercent: answeredCount > 0 ? scoreTotal / answeredCount : null,
    initSession,
    recordAnswer,
    setCurrentIdx,
    setUserAnswer,
    resetSession,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
