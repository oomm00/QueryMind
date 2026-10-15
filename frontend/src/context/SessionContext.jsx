/**
 * SessionContext — Study Session State Store
 * ===========================================
 * Replaces router-state passing with a persistent session store backed by
 * sessionStorage so refreshing /question or /feedback never loses progress.
 */

import React, { createContext, useContext, useState, useEffect } from 'react'

const SessionContext = createContext(null)
const SESSION_STORAGE_KEY = 'qm_study_session'

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
   * @param {Object} setup - { goal, topic, subject, bloom, difficulty, count }
   * @param {Array} questions - questions matching contract shape
   */
  const initSession = (setup, questions = []) => {
    const newSession = {
      setup,
      questions,
      currentIdx: 0,
      userAnswer: '',
      lastSubmission: null,
      startedAt: Date.now(),
    }
    setSession(newSession)
  }

  const setCurrentIdx = (idx) => {
    setSession((prev) => (prev ? { ...prev, currentIdx: idx, userAnswer: '' } : prev))
  }

  const setUserAnswer = (answer) => {
    setSession((prev) => (prev ? { ...prev, userAnswer: answer } : prev))
  }

  const recordSubmission = (submissionData) => {
    setSession((prev) => (prev ? { ...prev, lastSubmission: submissionData } : prev))
  }

  const resetSession = () => {
    setSession(null)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  }

  const value = {
    session,
    hasActiveSession: Boolean(session && session.questions?.length > 0),
    setup: session?.setup ?? null,
    questions: session?.questions ?? [],
    currentIdx: session?.currentIdx ?? 0,
    currentQuestion: session?.questions?.[session?.currentIdx ?? 0] ?? null,
    userAnswer: session?.userAnswer ?? '',
    lastSubmission: session?.lastSubmission ?? null,
    initSession,
    setCurrentIdx,
    setUserAnswer,
    recordSubmission,
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
