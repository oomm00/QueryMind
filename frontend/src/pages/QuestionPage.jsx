/**
 * QuestionPage — /question
 * Renders the active question in the study session.
 * Fixes timer bug by resetting startTime per question index.
 * Session state is read from SessionContext (backed by sessionStorage).
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import { getBloomColor } from '../constants/bloomTaxonomy.js'

export default function QuestionPage() {
  const navigate = useNavigate()
  const {
    hasActiveSession,
    questions,
    currentIdx,
    currentQuestion,
    setup,
    setUserAnswer: saveSessionAnswer,
  } = useSession()

  const [answer, setAnswer] = useState('')
  const [startTime, setStartTime] = useState(Date.now())

  // If page is refreshed or visited with no session, redirect to setup
  useEffect(() => {
    if (!hasActiveSession || !currentQuestion) {
      navigate('/setup', { replace: true })
    }
  }, [hasActiveSession, currentQuestion, navigate])

  // Timer fix: Reset startTime whenever currentIdx changes
  useEffect(() => {
    setStartTime(Date.now())
    setAnswer('')
  }, [currentIdx])

  if (!currentQuestion) return null

  const progress = questions.length ? ((currentIdx + 1) / questions.length) * 100 : 0
  const bloomColor = getBloomColor(currentQuestion.bloom_level)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return

    const timeTaken = Math.max(1, Math.round((Date.now() - startTime) / 1000))
    saveSessionAnswer(answer)

    navigate('/feedback', {
      state: {
        timeTaken,
      },
    })
  }

  return (
    <div className="page-wrapper items-start py-8">
      <div className="w-full max-w-3xl mx-auto animate-fade-in space-y-6">
        {/* Progress & Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider text-black"
                style={{ backgroundColor: bloomColor }}
              >
                {currentQuestion.bloom_level}
              </span>
              <span className="badge uppercase text-[10px]">
                {currentQuestion.difficulty}
              </span>
            </div>
          </div>

          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
              Topic: {currentQuestion.topic || setup?.topic}
            </span>
            {currentQuestion.question_id && (
              <span className="text-[10px] text-zinc-500 font-mono">
                ID: {currentQuestion.question_id.slice(0, 8)}…
              </span>
            )}
          </div>

          <p className="text-white text-base sm:text-lg leading-relaxed font-normal">
            {currentQuestion.question_text}
          </p>

          {Array.isArray(currentQuestion.hints) && currentQuestion.hints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-border text-xs text-zinc-400">
              <span className="text-zinc-500 font-medium mr-1">💡 Hint:</span>
              {currentQuestion.hints[0]}
            </div>
          )}
        </div>

        {/* Answer Input Form */}
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="answer" className="label">
              Your Answer / Reasoning
            </label>
            <textarea
              id="answer"
              rows={7}
              placeholder="Formulate your detailed answer here. Focus on precision, core mechanisms, and practical trade-offs…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="input resize-none leading-relaxed font-sans"
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              id="btn-back-setup"
              type="button"
              onClick={() => navigate('/setup')}
              className="btn-ghost"
            >
              ← Back to Setup
            </button>

            <button
              id="btn-submit-answer"
              type="submit"
              disabled={!answer.trim()}
              className="btn-primary"
            >
              Submit Answer →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
