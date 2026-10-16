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
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Textarea'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'

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
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto">
        {/* Progress & Header */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="font-mono">
              Question {currentIdx + 1} of {questions.length}
            </span>
            <span className="text-sm">
              {Math.round(progress)}% complete
            </span>
          </div>

          <div className="h-1.5 bg-[var(--line)] rounded-full overflow-hidden">
            <ProgressLine percentage={progress} />
          </div>
        </div>

        {/* Question Card */}
        <Panel className="mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-medium text-[var(--muted])">
              Topic: {currentQuestion.topic || setup?.topic}
            </span>
            {currentQuestion.question_id && (
              <span className="text-[10px] text-[var(--muted)] font-mono">
                ID: {currentQuestion.question_id.slice(0, 8)}…
              </span>
            )}
          </div>

          <p className="mt-3 text-[var(--ink)] text-base leading-relaxed font-normal">
            {currentQuestion.question_text}
          </p>

          {Array.isArray(currentQuestion.hints) && currentQuestion.hints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--line)] text-[var(--muted)] text-xs">
              <span className="font-medium mr-1">Hint:</span>
              {currentQuestion.hints[0]}
            </div>
          )}
        </Panel>

        {/* Answer Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="answer" className="block text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1.5">
              Your Answer / Reasoning
            </label>
            <Textarea
              id="answer"
              rows={7}
              placeholder="Formulate your detailed answer here. Focus on precision, core mechanisms, and practical trade-offs…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              id="btn-back-setup"
              type="button"
              variant="quiet"
              onClick={() => navigate('/setup')}
            >
              Back to Setup
            </Button>

            <Button
              id="btn-submit-answer"
              type="submit"
              disabled={!answer.trim()}
            >
              Submit Answer →
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}