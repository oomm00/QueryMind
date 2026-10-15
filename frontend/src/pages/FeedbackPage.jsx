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

  const [feedback, setFeedback] = useState(lastSubmission?.feedback ?? null)
  const [loading, setLoading] = useState(!lastSubmission)
  const [error, setError] = useState(null)

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
        }
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to evaluate answer')
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
  const scoreColor =
    scorePercent >= 80
      ? 'text-emerald-400'
      : scorePercent >= 50
      ? 'text-yellow-400'
      : 'text-rose-400'

  if (loading) {
    return (
      <div className="page-wrapper items-center justify-center">
        <div className="text-center animate-pulse-soft">
          <div className="text-4xl mb-3">⚡</div>
          <h2 className="text-lg font-semibold text-white">Evaluating Answer…</h2>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Analyzing conceptual depth and cognitive alignment
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrapper items-center justify-center">
        <div className="card max-w-md text-center p-6 space-y-4">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm text-rose-400">{error}</p>
          <button onClick={() => navigate('/question')} className="btn-ghost w-full">
            ← Return to Question
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrapper items-start py-8">
      <div className="w-full max-w-3xl mx-auto animate-slide-up space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              Evaluation & Feedback
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Question {currentIdx + 1} of {questions.length} • Completed in {timeTaken}s
            </p>
          </div>
        </div>

        {/* Score Card */}
        <div className="card text-center py-8">
          <span className="label mb-2">Overall Evaluator Score</span>
          <div className={`text-6xl font-display font-bold ${scoreColor}`}>
            {scorePercent}%
          </div>

          <div className="mt-4 max-w-md mx-auto h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${scorePercent}%`,
                background:
                  scorePercent >= 80 ? '#34d399' : scorePercent >= 50 ? '#fbbf24' : '#f87171',
              }}
            />
          </div>

          {/* Criteria Scores Grid (only rendered if criteria_scores is defined) */}
          {feedback?.criteria_scores && (
            <div className="mt-6 pt-6 border-t border-surface-border grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {Object.entries(feedback.criteria_scores).map(([criterion, val]) => {
                const cleanName = criterion.replace(/_/g, ' ')
                const critPct = Math.round(val * 100)
                return (
                  <div key={criterion} className="bg-zinc-950/60 p-3 rounded-lg border border-surface-border">
                    <span className="text-[11px] font-medium text-zinc-400 uppercase block mb-1">
                      {cleanName}
                    </span>
                    <span className="text-lg font-mono font-bold text-white">
                      {critPct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* AI Feedback */}
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>💡</span>
            <span>Cognitive Feedback</span>
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {feedback?.feedback_text}
          </p>
        </div>

        {/* Reference Answer */}
        {feedback?.correct_answer && (
          <div className="card bg-zinc-950/50 border-dashed space-y-2">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>✅</span>
              <span>Model Reference Answer</span>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {feedback.correct_answer}
            </p>
          </div>
        )}

        {/* Your Answer */}
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>📝</span>
            <span>Submitted Answer</span>
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap bg-zinc-950/60 p-3.5 rounded-lg border border-surface-border font-mono">
            {userAnswer}
          </p>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            id="btn-go-dashboard"
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn-ghost flex-1"
          >
            Mastery Dashboard
          </button>

          <button
            id="btn-next-question"
            type="button"
            onClick={() => {
              if (hasNext) {
                setCurrentIdx(currentIdx + 1)
                navigate('/question')
              } else {
                navigate('/dashboard')
              }
            }}
            className="btn-primary flex-1"
          >
            {hasNext ? 'Next Question →' : 'Complete Session →'}
          </button>
        </div>
      </div>
    </div>
  )
}
