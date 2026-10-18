/**
 * QuestionPage — /practice/session
 *
 * One question from the course bank. An `mcq` is answered by choosing an option
 * and is graded here, from the authored `correctIndex`; a `short` answer is
 * written out and self-marked on the feedback page against the authored rubric.
 *
 * A graded mcq is a scored answer, so it moves the concept's mastery estimate
 * (lib/mastery.js) once; nothing else on this page does.
 *
 * Every question carries the "Course bank" badge and names the concept, the
 * Bloom level and the difficulty it came from, so a student can always see where
 * it came from — and so can anyone checking the answer against the content file.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { recordScore } from '../lib/masteryStore.js'
import {
  BANK_SOURCE_LABEL,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  gradeChoice,
} from '../content/questionBank.js'
import { cx } from '../lib/cx'
import { sentenceCase } from '../lib/text'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressLine } from '../components/ui/ProgressLine'
import { Textarea } from '../components/ui/Textarea'
import { IconArrowLeft, IconArrowRight } from '../components/ui/Icons'

export default function QuestionPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const {
    hasActiveSession,
    questions,
    currentIdx,
    currentQuestion,
    answers,
    recordAnswer,
    setUserAnswer,
  } = useSession()

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'Session' },
  ])

  const [selected, setSelected] = useState(null)
  const [answer, setAnswer] = useState('')
  const [startTime, setStartTime] = useState(Date.now())

  // If the page is refreshed or visited with no session, go back to setup.
  useEffect(() => {
    if (!hasActiveSession || !currentQuestion) {
      navigate('/practice/new', { replace: true })
    }
  }, [hasActiveSession, currentQuestion, navigate])

  // A new question starts with a clean slate and its own clock.
  useEffect(() => {
    setSelected(null)
    setAnswer('')
    setStartTime(Date.now())
  }, [currentIdx])

  if (!currentQuestion) return null

  const isChoice = currentQuestion.type === 'mcq'
  const answered = Boolean(answers[currentQuestion.question_id])
  const progress = questions.length ? ((currentIdx + 1) / questions.length) * 100 : 0
  const elapsed = () => Math.max(1, Math.round((Date.now() - startTime) / 1000))

  const submitChoice = (event) => {
    event.preventDefault()
    if (selected === null) return
    const result = gradeChoice(currentQuestion, selected)
    recordAnswer({
      questionId: currentQuestion.question_id,
      answer: String(selected),
      ...result,
      timeTaken: elapsed(),
    })
    // Mastery moves once per answered question: reading the feedback again, or
    // re-answering in the same session, replaces the result rather than adding
    // a second sample.
    if (!answered) {
      recordScore(userId, {
        conceptId: currentQuestion.conceptId,
        bloom: currentQuestion.bloom_level,
        score: result.score,
      })
    }
    navigate('/practice/feedback')
  }

  const submitAnswer = (event) => {
    event.preventDefault()
    if (!answer.trim()) return
    // A short answer is not scored here: the student marks it against the
    // rubric on the feedback page, where the answer key is shown.
    setUserAnswer(answer.trim())
    navigate('/practice/feedback')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Question ${currentIdx + 1} of ${questions.length}`}
        description={
          currentQuestion.conceptTitle
            ? `${sentenceCase(currentQuestion.conceptTitle)} — ${currentQuestion.originLabel.toLowerCase()}`
            : currentQuestion.originLabel
        }
        actions={
          <span className="text-sm tabular-nums text-muted">{Math.round(progress)}% complete</span>
        }
      />

      <ProgressLine percentage={progress} className="mb-6" />

      <Panel className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary" label={BANK_SOURCE_LABEL} />
          <Badge variant="neutral" label={QUESTION_TYPE_LABELS[currentQuestion.type] ?? 'Question'} />
          <Badge variant="neutral" label={sentenceCase(currentQuestion.bloom_level)} />
          <Badge
            variant="neutral"
            label={DIFFICULTY_LABELS[currentQuestion.difficulty] ?? currentQuestion.difficulty}
          />
        </div>

        <p className="mt-3 text-base font-normal leading-relaxed text-ink">
          {currentQuestion.question_text}
        </p>
      </Panel>

      {isChoice ? (
        <form onSubmit={submitChoice} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink">Choose one answer</legend>
            <div className="space-y-2">
              {currentQuestion.options.map((option, index) => (
                <label
                  key={option}
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors duration-150',
                    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
                    selected === index
                      ? 'border-primary bg-primary-tint'
                      : 'border-line bg-surface-raised hover:border-line-strong'
                  )}
                >
                  <input
                    type="radio"
                    name="option"
                    value={index}
                    checked={selected === index}
                    onChange={() => setSelected(index)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm leading-relaxed text-ink">{option}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              icon={<IconArrowLeft size={16} />}
              onClick={() => navigate('/practice/new')}
            >
              Back to setup
            </Button>

            <Button
              id="btn-check-answer"
              type="submit"
              icon={<IconArrowRight size={16} />}
              disabled={selected === null}
            >
              {answered ? 'See feedback again' : 'Check answer'}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitAnswer} className="space-y-4">
          <Textarea
            id="answer"
            label="Your answer"
            rows={7}
            placeholder="Answer in your own words. You will mark it yourself against the key on the next page — the app does not grade prose."
            value={answer || (answered ? answers[currentQuestion.question_id].answer : '')}
            onChange={(event) => setAnswer(event.target.value)}
            required
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
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
              disabled={!answer.trim() && !answered}
            >
              {answered ? 'See feedback again' : 'Submit answer'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
