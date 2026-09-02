/**
 * FeedbackPage — /feedback
 * Submits the answer to the backend for evaluation and shows the score + feedback.
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { attemptsApi } from '../api/client.js'

export default function FeedbackPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const state     = location.state

  const [feedback, setFeedback]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    if (!state?.questionId) {
      navigate('/setup')
      return
    }

    const userId = localStorage.getItem('qm_user_id') ?? '00000000-0000-0000-0000-000000000001'

    attemptsApi
      .submit({
        question_id:        state.questionId,
        user_id:            userId,
        user_answer:        state.userAnswer,
        time_taken_seconds: state.timeTaken,
      })
      .then(setFeedback)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const { questions = [], currentIdx = 0, setup = {} } = state ?? {}
  const hasNext = currentIdx + 1 < questions.length

  if (loading) return (
    <div className="page-wrapper">
      <div className="text-center animate-pulse-soft">
        <div className="text-4xl mb-4">⚡</div>
        <p className="text-[var(--color-muted)]">Evaluating your answer…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="page-wrapper">
      <div className="card max-w-md text-center">
        <p className="text-red-400 mb-4">⚠️ {error}</p>
        <button onClick={() => navigate('/setup')} className="btn-ghost">← Back</button>
      </div>
    </div>
  )

  const scorePercent = Math.round((feedback?.score ?? 0) * 100)
  const scoreColor =
    scorePercent >= 80 ? 'text-emerald-400' :
    scorePercent >= 50 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="page-wrapper items-start py-12">
      <div className="w-full max-w-2xl mx-auto animate-slide-up space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Answer Feedback</h1>
          <p className="text-[var(--color-muted)] text-sm mt-1">
            Question {currentIdx + 1} of {questions.length}
          </p>
        </div>

        {/* Score Card */}
        <div className="card text-center">
          <p className="text-[var(--color-muted)] text-sm uppercase tracking-widest mb-2">Score</p>
          <p className={`text-6xl font-display font-bold ${scoreColor}`}>
            {scorePercent}%
          </p>
          <div className="mt-4 h-2 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${scorePercent}%`,
                background: scorePercent >= 80 ? '#34d399' : scorePercent >= 50 ? '#fbbf24' : '#f87171',
              }}
            />
          </div>
        </div>

        {/* Your Answer */}
        <div className="card">
          <h2 className="font-semibold text-white mb-3">📝 Your Answer</h2>
          <p className="text-[var(--color-muted)] leading-relaxed whitespace-pre-wrap">
            {state?.userAnswer}
          </p>
        </div>

        {/* Feedback */}
        <div className="card border-brand-800/50">
          <h2 className="font-semibold text-white mb-3">💡 AI Feedback</h2>
          <p className="text-[var(--color-muted)] leading-relaxed">{feedback?.feedback}</p>
        </div>

        {/* Reference Answer */}
        <div className="card bg-surface-DEFAULT border-dashed">
          <h2 className="font-semibold text-white mb-3">✅ Reference Answer</h2>
          <p className="text-[var(--color-muted)] leading-relaxed">{feedback?.correct_answer}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            id="btn-go-dashboard"
            onClick={() => navigate('/dashboard')}
            className="btn-ghost flex-1"
          >
            View Dashboard
          </button>
          <button
            id="btn-next-question"
            onClick={() => {
              if (hasNext) {
                navigate('/question', {
                  state: { setup, questions, currentIdx: currentIdx + 1 },
                })
              } else {
                navigate('/dashboard')
              }
            }}
            className="btn-primary flex-1"
          >
            {hasNext ? 'Next Question →' : 'Finish Session →'}
          </button>
        </div>
      </div>
    </div>
  )
}
