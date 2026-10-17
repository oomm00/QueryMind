/**
 * FeedbackPage — /practice/feedback
 * Submits the user's answer to attemptsApi.submit and displays evaluation scores,
 * optional criteria scores, feedback text, and reference answer.
 * Uses SessionContext and AuthContext (no nil-UUID fallback).
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { MetricBar } from '../components/ui/MetricBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { Toast } from '../components/ui/Toast'
import { IconCheck, IconNotes, IconDashboard, IconArrowRight } from '../components/ui/Icons'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userId } = useAuth()
  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'Feedback' },
  ])
  const {
    hasActiveSession,
    questions,
    currentIdx,
    currentQuestion,
    userAnswer,
    lastSubmission,
    recordSubmission,
    setCurrentIdx,
  } = useSession()

  const timeTaken = location.state?.timeTaken ?? lastSubmission?.timeTaken ?? 30

  const submissionMatches =
    Boolean(lastSubmission) && lastSubmission.questionId === currentQuestion?.question_id

  const [feedback, setFeedback] = useState(submissionMatches ? lastSubmission.feedback : null)
  const [loading, setLoading] = useState(!submissionMatches)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Redirect if no session exists
  useEffect(() => {
    if (!hasActiveSession || !currentQuestion) {
      navigate('/practice/new', { replace: true })
    }
  }, [hasActiveSession, currentQuestion, navigate])

  // Submit attempt on initial load if not already evaluated
  useEffect(() => {
    let active = true

    if (lastSubmission && lastSubmission.questionId === currentQuestion?.question_id) {
      setFeedback(lastSubmission.feedback)
      setLoading(false)
      return
    }

    if (!userAnswer || !currentQuestion) return

    setLoading(true)
    setError(null)

    attemptsApi
      .submit(
        {
          question_id: currentQuestion.question_id,
          answer_text: userAnswer,
          time_taken_seconds: timeTaken,
        },
        userId
      )
      .then((data) => {
        if (active) {
          setFeedback(data)
          recordSubmission({
            questionId: currentQuestion.question_id,
            questionText: currentQuestion.question_text,
            userAnswer,
            feedback: data,
            timeTaken,
          })
          // Show success toast
          setToast({
            title: 'Answer evaluated',
            description: `Score: ${Math.round((data.score ?? 0) * 100)}%`,
            variant: 'default',
          })
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message ?? 'Failed to evaluate answer')
          setToast({
            title: 'Evaluation failed',
            description: err.message ?? 'Failed to evaluate answer',
            variant: 'error',
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentQuestion, userAnswer, userId, timeTaken])

  if (!currentQuestion) return null

  const hasNext = currentIdx + 1 < questions.length
  const scorePercent = Math.round((feedback?.score ?? 0) * 100)

  // Tone based on score
  const scoreTone = scorePercent >= 80 ? 'success' : scorePercent >= 50 ? 'warning' : 'danger'
  const scoreSummary =
    scorePercent >= 80
      ? 'Strong grasp of core concepts'
      : scorePercent >= 50
        ? 'Good understanding, room for expansion'
        : 'Needs more development'

  const header = (
    <PageHeader
      title="Evaluation & feedback"
      description={`Question ${currentIdx + 1} of ${questions.length} — completed in ${timeTaken}s`}
    />
  )

  if (loading) {
    return (
      <>
        {header}
        <Panel className="p-6">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        </Panel>
      </>
    )
  }

  if (error && !feedback) {
    return (
      <>
        {header}
        <ErrorState title="Evaluation failed" message={error} />
      </>
    )
  }

  return (
    <>
      {header}

      {/* Score card */}
      <Panel className="p-6 text-center">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Overall evaluator score
        </span>
        <div className="my-2 text-5xl font-semibold tabular-nums text-ink">{scorePercent}%</div>
        <ProgressLine percentage={scorePercent} tone={scoreTone} />
        <p className="mt-2 text-sm text-muted">{scoreSummary}</p>
      </Panel>

      {/* Criteria scores grid */}
      {feedback?.criteria_scores && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
            Criteria scores
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.entries(feedback.criteria_scores).map(([criterion, val]) => (
              <div
                key={criterion}
                className="rounded-control border border-line bg-surface-raised p-3"
              >
                <MetricBar
                  label={criterion.replace(/_/g, ' ')}
                  value={`${Math.round(val * 100)}%`}
                  score={val}
                  tone={scoreTone}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* AI feedback */}
      {feedback && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            <IconNotes size={15} />
            Cognitive feedback
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {feedback.feedback_text}
          </p>
        </Panel>
      )}

      {/* Reference answer */}
      {feedback?.correct_answer && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            <IconCheck size={15} />
            Model reference answer
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {feedback.correct_answer}
          </p>
        </Panel>
      )}

      {/* Your answer */}
      {userAnswer && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            <IconNotes size={15} />
            Submitted answer
          </h2>
          <p className="whitespace-pre-wrap rounded-control bg-surface-raised p-3 text-sm leading-relaxed text-ink">
            {userAnswer}
          </p>
        </Panel>
      )}

      {/* Navigation actions */}
      <div className="mt-6 flex items-center gap-3 pt-2">
        <Button
          id="btn-go-dashboard"
          type="button"
          variant="secondary"
          className="flex-1"
          icon={<IconDashboard size={16} />}
          onClick={() => navigate('/dashboard')}
        >
          Mastery dashboard
        </Button>

        <Button
          id="btn-next-question"
          type="button"
          className="flex-1"
          icon={<IconArrowRight size={16} />}
          onClick={() => {
            if (hasNext) {
              // Advance the session index; SessionContext persists it.
              setCurrentIdx(currentIdx + 1)
              navigate('/practice/session')
            } else {
              navigate('/dashboard')
            }
          }}
        >
          {hasNext ? 'Next question' : 'Complete session'}
        </Button>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </>
  )
}
