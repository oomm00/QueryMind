/**
 * QuestionPage — /question
 * Fetches a stub question from the backend and renders it.
 * On submit, navigates to /feedback with the answer + response.
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { questionsApi } from '../api/client.js'

export default function QuestionPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const setup     = location.state?.setup ?? {
    topic: 'General Knowledge', bloom: 'understand', difficulty: 'medium', numQ: 1,
  }

  const [questions, setQuestions]   = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answer, setAnswer]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)
  const [startTime]                 = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    questionsApi
      .generate({
        topic:         setup.topic,
        bloom_level:   setup.bloom,
        difficulty:    setup.difficulty,
        num_questions: Number(setup.numQ),
      })
      .then((data) => {
        if (!cancelled) setQuestions(data.questions ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const currentQuestion = questions[currentIdx]
  const progress = questions.length ? ((currentIdx) / questions.length) * 100 : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!answer.trim() || !currentQuestion) return

    const timeTaken = Math.round((Date.now() - startTime) / 1000)
    setSubmitting(true)

    navigate('/feedback', {
      state: {
        questionId:   currentQuestion.id,
        questionText: currentQuestion.question_text,
        userAnswer:   answer,
        timeTaken,
        setup,
        questions,
        currentIdx,
      },
    })
  }

  if (loading) return <LoadingState />
  if (error)   return <ErrorState message={error} onBack={() => navigate('/setup')} />
  if (!currentQuestion) return <ErrorState message="No questions returned." onBack={() => navigate('/setup')} />

  return (
    <div className="page-wrapper items-start py-12">
      <div className="w-full max-w-2xl mx-auto animate-fade-in">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--color-muted)] mb-2">
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <div className="flex gap-2">
              <span className="badge">{setup.bloom}</span>
              <span className="badge">{setup.difficulty}</span>
            </div>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-brand rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[var(--color-muted)] text-xs uppercase tracking-widest font-semibold">
              Topic: {setup.topic}
            </span>
          </div>
          <p className="text-white text-lg leading-relaxed">{currentQuestion.question_text}</p>
        </div>

        {/* Answer Form */}
        <form onSubmit={handleSubmit} className="card">
          <label htmlFor="answer" className="label">Your Answer</label>
          <textarea
            id="answer"
            rows={6}
            placeholder="Type your answer here…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="input resize-none mb-4"
            required
          />
          <div className="flex gap-3">
            <button
              id="btn-skip-question"
              type="button"
              onClick={() => navigate('/setup')}
              className="btn-ghost"
            >
              ← Back
            </button>
            <button
              id="btn-submit-answer"
              type="submit"
              disabled={submitting || !answer.trim()}
              className="btn-primary flex-1"
            >
              {submitting ? 'Evaluating…' : 'Submit Answer →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="page-wrapper">
      <div className="text-center animate-pulse-soft">
        <div className="text-4xl mb-4">🧠</div>
        <p className="text-[var(--color-muted)]">Generating your question…</p>
      </div>
    </div>
  )
}

function ErrorState({ message, onBack }) {
  return (
    <div className="page-wrapper">
      <div className="card max-w-md text-center">
        <p className="text-red-400 mb-4">⚠️ {message}</p>
        <button onClick={onBack} className="btn-ghost">← Back to Setup</button>
      </div>
    </div>
  )
}
