/**
 * FeedbackPage — /feedback
 * Submits the user's answer to attemptsApi.submit and displays evaluation scores,
 * optional criteria scores, feedback text, and reference answer.
 * Uses SessionContext and AuthContext (no nil-UUID fallback).
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { Button } from '../components/ui/Button'
import { Panel, PanelLarge } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { Toast } from '../components/ui/Toast'

export default function FeedbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { userId } = useAuth()
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
      navigate('/setup', { replace: true })
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

  // Status color based on score
  const getScoreColor = () => {
    if (scorePercent >= 80) return 'moss'
    if (scorePercent >= 50) return 'amber'
    return 'rust'
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <PanelLarge className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold text-[var(--ink)] tracking-tight">
                Evaluation & Feedback
              </h1>
              <p className="text-[var(--muted)] mt-1">
                Question {currentIdx + 1} of {questions.length} • Completed in {timeTaken}s
              </p>
            </div>
          </div>
        </PanelLarge>

        {/* Score Card */}
        <Panel>
          <div className="text-center">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Overall Evaluator Score</span>
            <div className="text-6xl font-display font-bold text-[var(--ink)] my-2">
              {scorePercent}%
            </div>
            <ProgressLine percentage={scorePercent} />
            <p className="text-[var(--muted)] text-sm mt-1">
              {scorePercent >= 80
                ? 'Strong grasp of core concepts'
                : scorePercent >= 50
                  ? 'Good understanding, room for expansion'
                  : 'Needs more development'}
            </p>
          </div>
        </Panel>

        {/* Criteria Scores Grid */}
        {feedback?.criteria_scores && (
          <Panel className="mt-4">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              Criteria Scores
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(feedback.criteria_scores).map(([criterion, val]) => {
                const critPct = Math.round(val * 100)
                const scoreColor = getScoreColor()
                return (
                  <div
                    key={criterion}
                    className="rounded-md bg-[var(--surface)/50] border border-[var(--line)] p-3"
                  >
                    <span className="text-xs font-medium text-[var(--muted)] uppercase block mb-1">
                      {criterion.replace(/_/g, ' ')}
                    </span>
                    <span className="text-lg font-mono font-bold text-[var(--ink)]">
                      {critPct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}

        {/* AI Feedback */}
        {feedback && (
          <Panel className="mt-4">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              Cognitive Feedback
            </h2>
            <p className="text-[var(--ink)] text-sm leading-relaxed whitespace-pre-wrap">
              {feedback.feedback_text}
            </p>
          </Panel>
        )}

        {/* Reference Answer */}
        {feedback?.correct_answer && (
          <Panel className="mt-4 p-3 rounded-md bg-[var(--surface)/50] border border-[var(--line)]">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface)/50] px-2.5 py-0.5 text-[var(--muted)]">
                ✅
              </span>
              Model Reference Answer
            </h2>
            <p className="text-[var(--ink)] text-sm leading-relaxed whitespace-pre-wrap">
              {feedback.correct_answer}
            </p>
          </Panel>
        )}

        {/* Your Answer */}
        {userAnswer && (
          <Panel className="mt-4 p-3 rounded-md bg-[var(--surface)/50] border border-[var(--line)]">
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface)/50] px-2.5 py-0.5 text-[var(--muted)]">
                📝
              </span>
              Submitted Answer
            </h2>
            <p className="text-[var(--ink)] text-sm leading-relaxed whitespace-pre-wrap bg-[var(--surface)/60] p-3 rounded">
              {userAnswer}
            </p>
          </Panel>
        )}

        {/* Navigation Actions */}
        <div className="mt-6 flex items-center gap-3 pt-2">
          <Button
            id="btn-go-dashboard"
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn-quiet flex-1"
          >
            Mastery Dashboard
          </Button>

          <Button
            id="btn-next-question"
            type="button"
            onClick={() => {
              if (hasNext) {
                // Advance the session index; SessionContext persists it.
                setCurrentIdx(currentIdx + 1)
                navigate('/question')
              } else {
                navigate('/dashboard')
              }
            }}
            className="btn-primary flex-1"
          >
            {hasNext ? 'Next Question →' : 'Complete Session →'}
          </Button>
        </div>

        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  )
}