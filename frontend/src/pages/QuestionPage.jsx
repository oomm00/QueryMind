/**
 * QuestionPage — /practice/session
 * Renders the active question in the study session.
 * Fixes timer bug by resetting startTime per question index.
 * Session state is read from SessionContext (backed by sessionStorage).
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Textarea'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { PageHeader } from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { IconArrowLeft, IconArrowRight } from '../components/ui/Icons'

export default function QuestionPage() {
  const navigate = useNavigate()
  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'Session' },
  ])
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
      navigate('/practice/new', { replace: true })
    }
  }, [hasActiveSession, currentQuestion, navigate])

  // Timer fix: Reset startTime whenever currentIdx changes
  useEffect(() => {
    setStartTime(Date.now())
    setAnswer('')
  }, [currentIdx])

  if (!currentQuestion) return null

  const progress = questions.length ? ((currentIdx + 1) / questions.length) * 100 : 0
  const topic = currentQuestion.topic || setup?.topic || 'General'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return

    const timeTaken = Math.max(1, Math.round((Date.now() - startTime) / 1000))
    saveSessionAnswer(answer)

    navigate('/practice/feedback', {
      state: {
        timeTaken,
      },
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Question ${currentIdx + 1} of ${questions.length}`}
        description={`Topic: ${topic}`}
        actions={
          <span className="text-sm tabular-nums text-muted">{Math.round(progress)}% complete</span>
        }
      />

      <ProgressLine percentage={progress} className="mb-6" />

      {/* Question card */}
      <Panel className="mb-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="primary" label={topic} />
          {currentQuestion.question_id && (
            <span className="font-mono text-[11px] text-muted">
              ID: {currentQuestion.question_id.slice(0, 8)}…
            </span>
          )}
        </div>

        <p className="mt-3 text-base font-normal leading-relaxed text-ink">
          {currentQuestion.question_text}
        </p>

        {Array.isArray(currentQuestion.hints) && currentQuestion.hints.length > 0 && (
          <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
            <span className="mr-1 font-medium text-ink">Hint:</span>
            {currentQuestion.hints[0]}
          </div>
        )}
      </Panel>

      {/* Answer input form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          id="answer"
          label="Your answer / reasoning"
          rows={7}
          placeholder="Formulate your detailed answer here. Focus on precision, core mechanisms, and practical trade-offs…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
        />

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            id="btn-back-setup"
            type="button"
            variant="secondary"
            icon={<IconArrowLeft size={16} />}
            onClick={() => navigate('/practice/new')}
          >
            Back to setup
          </Button>

          <Button
            id="btn-submit-answer"
            type="submit"
            icon={<IconArrowRight size={16} />}
            disabled={!answer.trim()}
          >
            Submit answer
          </Button>
        </div>
      </form>
    </div>
  )
}
