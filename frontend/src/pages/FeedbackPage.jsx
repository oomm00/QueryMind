/**
 * FeedbackPage — /practice/feedback
 *
 * What happened to the answer just given, and what to do about it.
 *
 * An `mcq` was graded on the question page, from the authored `correctIndex`, so
 * this page reports the verdict and shows the explanation. A `short` answer is
 * self-marked here: the answer key and the rubric are shown, the student ticks
 * the criteria they met, and the page says "Self-marked" wherever the result is
 * read — it never pretends a model graded prose.
 *
 * When the real backend is on, a short answer is submitted through the existing
 * attempt endpoint instead, and its evaluation is shown as the backend's.
 *
 * The page ends with the concept's study material, because the next useful thing
 * after a wrong answer is usually the reading behind it.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { isMocked } from '../api/mocks/config.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { BANK_SOURCE_LABEL, rubricScore } from '../content/questionBank.js'
import { sentenceCase } from '../lib/text'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { MetricBar } from '../components/ui/MetricBar'
import { Panel } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressLine } from '../components/ui/ProgressLine'
import { ErrorState } from '../components/ui/ErrorState'
import { StudyMaterial } from '../components/content/StudyMaterial'
import { IconArrowRight, IconCheck, IconClose, IconDashboard, IconNotes } from '../components/ui/Icons'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function percent(value) {
  return Math.round((Number(value) || 0) * 100)
}

export default function FeedbackPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const {
    hasActiveSession,
    questions,
    currentIdx,
    currentQuestion,
    userAnswer,
    answers,
    recordAnswer,
    setCurrentIdx,
    resetSession,
  } = useSession()

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'Feedback' },
  ])

  const [markedTicks, setMarkedTicks] = useState(null)
  const [remote, setRemote] = useState(null)
  const [remoteState, setRemoteState] = useState('idle')
  const [error, setError] = useState(null)

  const currentId = currentQuestion?.question_id ?? null
  const result = currentId ? answers[currentId] ?? null : null

  useEffect(() => {
    if (!hasActiveSession || !currentQuestion) {
      navigate('/practice/new', { replace: true })
    }
  }, [hasActiveSession, currentQuestion, navigate])

  // Each question is marked on its own.
  useEffect(() => {
    setMarkedTicks(null)
    setRemote(null)
    setRemoteState('idle')
    setError(null)
  }, [currentIdx])

  if (!currentQuestion) return null

  const isChoice = currentQuestion.type === 'mcq'
  const rubric = currentQuestion.rubric ?? []
  // Ticks start from the mark already saved for this question, if there is one.
  const metIndexes = markedTicks ?? result?.metIndexes ?? []
  const mark = rubricScore(rubric, metIndexes)
  const selfMarkedHere = !isChoice && Boolean(result?.selfMarked)
  const useBackend = !isChoice && !isMocked('attempts')

  const answered = Object.values(answers)
  const correctCount = answered.filter((entry) => entry.correct === true).length
  const selfCount = answered.filter((entry) => entry.selfMarked).length
  const hasNext = currentIdx + 1 < questions.length

  const score = result ? Number(result.score) || 0 : isChoice ? 0 : mark.score
  const scorePercent = percent(score)
  const scoreTone = scorePercent >= 80 ? 'success' : scorePercent >= 50 ? 'warning' : 'danger'

  const toggleCriterion = (index) => {
    setMarkedTicks(
      metIndexes.includes(index)
        ? metIndexes.filter((value) => value !== index)
        : [...metIndexes, index]
    )
  }

  const saveSelfMark = () => {
    recordAnswer({
      questionId: currentQuestion.question_id,
      answer: result?.answer ?? userAnswer,
      score: mark.score,
      correct: null,
      selfMarked: true,
      earned: mark.earned,
      total: mark.total,
      metIndexes,
    })
  }

  const submitToBackend = async () => {
    setRemoteState('loading')
    setError(null)
    try {
      const data = await attemptsApi.submit(
        {
          question_id: currentQuestion.question_id,
          answer_text: result?.answer ?? userAnswer,
          time_taken_seconds: result?.timeTaken ?? 0,
        },
        userId
      )
      setRemote(data)
      setRemoteState('done')
      recordAnswer({
        questionId: currentQuestion.question_id,
        answer: result?.answer ?? userAnswer,
        score: Number(data?.score) || 0,
        correct: null,
        selfMarked: false,
        gradedBy: 'backend',
      })
    } catch (err) {
      setRemoteState('error')
      setError(err.message ?? 'The submission could not be evaluated')
    }
  }

  // An mcq with no recorded result means the question was never answered.
  if (isChoice && !result) {
    return (
      <>
        <PageHeader title="Nothing to show yet" />
        <ErrorState
          title="This question has not been answered"
          message="Pick an answer on the question page and it will be graded straight away."
          onRetry={() => navigate('/practice/session')}
          retryLabel="Back to the question"
        />
      </>
    )
  }

  const verdictLabel = isChoice
    ? result.correct
      ? 'Correct'
      : 'Incorrect'
    : selfMarkedHere
      ? 'Self-marked'
      : 'Not marked yet'

  const verdictTone = isChoice ? (result.correct ? 'success' : 'danger') : selfMarkedHere ? 'primary' : 'neutral'

  return (
    <>
      <PageHeader
        title="Feedback"
        description={`Question ${currentIdx + 1} of ${questions.length}${
          currentQuestion.conceptTitle ? ` — ${sentenceCase(currentQuestion.conceptTitle)}` : ''
        }`}
        actions={<Badge variant="primary" label={BANK_SOURCE_LABEL} />}
      />

      <Panel className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={verdictTone} label={verdictLabel} />
          <span className="text-3xl font-semibold tabular-nums text-ink">{scorePercent}%</span>
        </div>

        <ProgressLine percentage={scorePercent} tone={scoreTone} className="mt-4" />

        {isChoice ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {result.correct
              ? 'You chose the right option.'
              : `The right option was “${currentQuestion.options[currentQuestion.correctIndex]}”.`}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {selfMarkedHere
              ? `You marked this yourself: ${mark.earned} of ${plural(mark.total, 'point')}.`
              : useBackend
                ? 'Send your answer to the evaluator when you are ready, or mark it yourself below.'
                : 'Read the answer key and the rubric below, then tick the criteria your answer met. Nothing is scored until you do.'}
          </p>
        )}

        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Session so far: {answered.length} of {questions.length} answered
          {correctCount > 0 ? ` · ${correctCount} correct` : ''}
          {selfCount > 0 ? ` · ${plural(selfCount, 'answer')} self-marked` : ''}
        </p>
      </Panel>

      {/* Self-marking, while the app is mocked */}
      {!isChoice && !useBackend && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            <IconCheck size={15} />
            Mark your answer
          </h2>
          <p className="mb-3 text-xs text-muted">
            Self-marked — the rubric is the author&apos;s, the judgement is yours. The app does not
            grade prose.
          </p>

          <ul className="space-y-2">
            {rubric.map((criterion, index) => (
              <li key={`${criterion.criterion}-${index}`}>
                <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-surface-raised p-3">
                  <input
                    type="checkbox"
                    checked={metIndexes.includes(index)}
                    onChange={() => toggleCriterion(index)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm leading-relaxed text-ink">
                    {criterion.criterion}
                    <span className="ml-1 text-xs text-muted">
                      {plural(Number(criterion.points) || 0, 'point')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">
              Mark: {mark.earned} of {plural(mark.total, 'point')} ({percent(mark.score)}%)
            </span>
            <Button size="sm" onClick={saveSelfMark}>
              {selfMarkedHere ? 'Update my mark' : 'Save my mark'}
            </Button>
          </div>
        </Panel>
      )}

      {/* The real backend's evaluation, when the backend is on */}
      {!isChoice && useBackend && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            <IconNotes size={15} />
            Evaluator
          </h2>

          {remoteState === 'done' && remote ? (
            <div className="space-y-3">
              {remote.criteria_scores && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {Object.entries(remote.criteria_scores).map(([criterion, value]) => (
                    <div key={criterion} className="rounded-control border border-line bg-surface-raised p-3">
                      <MetricBar
                        label={criterion.replace(/_/g, ' ')}
                        value={`${percent(value)}%`}
                        score={value}
                        tone={scoreTone}
                      />
                    </div>
                  ))}
                </div>
              )}
              {remote.feedback_text && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {remote.feedback_text}
                </p>
              )}
            </div>
          ) : (
            <>
              {remoteState === 'error' && error && (
                <ErrorState className="mb-3" title="Evaluation failed" message={error} />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Your answer goes to the evaluator; its score is the backend&apos;s, not the
                  app&apos;s.
                </p>
                <Button
                  size="sm"
                  loading={remoteState === 'loading'}
                  onClick={submitToBackend}
                  disabled={!(result?.answer ?? userAnswer)}
                >
                  Submit for evaluation
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* The answer key, for a short answer */}
      {!isChoice && currentQuestion.answerKey && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted">
            Answer key
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {currentQuestion.answerKey}
          </p>
        </Panel>
      )}

      {/* The student's own words */}
      {!isChoice && (result?.answer ?? userAnswer) && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted">
            Your answer
          </h2>
          <p className="whitespace-pre-wrap rounded-control bg-surface-raised p-3 text-sm leading-relaxed text-ink">
            {result?.answer ?? userAnswer}
          </p>
        </Panel>
      )}

      {/* Why the answer is what it is */}
      {currentQuestion.explanation && (
        <Panel className="mt-4 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
            {isChoice && !result.correct ? <IconClose size={15} /> : <IconCheck size={15} />}
            Explanation
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {currentQuestion.explanation}
          </p>
        </Panel>
      )}

      <Panel className="mt-4 p-5">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-muted">
          Study material (optional)
        </h2>
        <p className="mb-3 text-xs text-muted">
          Reading for {currentQuestion.conceptTitle ? sentenceCase(currentQuestion.conceptTitle) : 'this concept'}. Nothing here is required.
        </p>
        <StudyMaterial resources={currentQuestion.resources ?? []} />
      </Panel>

      <div className="mt-6 flex items-center gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          icon={<IconDashboard size={16} />}
          onClick={() => {
            resetSession()
            navigate('/dashboard')
          }}
        >
          End session
        </Button>

        <Button
          type="button"
          className="flex-1"
          icon={<IconArrowRight size={16} />}
          disabled={!isChoice && !result}
          onClick={() => {
            if (hasNext) {
              setCurrentIdx(currentIdx + 1)
              navigate('/practice/session')
            } else {
              resetSession()
              navigate('/dashboard')
            }
          }}
        >
          {hasNext ? 'Next question' : 'Finish session'}
        </Button>
      </div>

      {!isChoice && !result && (
        <p className="mt-3 text-center text-xs text-muted">
          Mark your answer to continue to the next question.
        </p>
      )}
    </>
  )
}
