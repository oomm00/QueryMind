/**
 * SessionPage — /practice/:sessionId.
 *
 * One practice session, question by question. It answers a strip of numbers and
 * a card, and nothing else: no correct answers, no explanations, no mastery
 * figures. Everything that could give the game away is held back until the
 * results page on purpose.
 *
 * The session reaches storage with its first answer, so the recent list never
 * lists an empty one; from then on every answer, flag and word of a short answer
 * is written the moment it changes, and opening the same URL again - after a
 * refresh, or tomorrow - resumes at the first question that has no answer yet.
 *
 * Mastery moves at submit: an mcq is scored then, once, keyed by the session and
 * the question (see masteryStore.js). A short answer is scored later, when the
 * student marks it on the results page.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import {
  clearAnswer,
  getDraft,
  getSession,
  holdDraft,
  patchSession,
  recordAnswer,
  recordSelfMark,
  releaseDraft,
  saveSession,
  submitSession,
  toggleFlag,
  useStoredSession,
} from '../lib/sessions.js'
import { recordScore } from '../lib/masteryStore.js'
import { marksForQuestion, scoreOf } from '../lib/marks.js'
import { gradeGeneratedAnswer } from '../lib/generateGrading.js'
import { resolveQuestions } from '../content/practiceBank.js'
import { QUESTION_TYPE_LABELS } from '../content/questionBank.js'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PanelLarge } from '../components/ui/Panel'
import { Textarea } from '../components/ui/Textarea'
import { EmptyState } from '../components/ui/EmptyState'
import { Dialog } from '../components/ui/Dialog.jsx'
import { BloomChip } from '../components/practice/BloomChip.jsx'
import { QuestionNumberStrip } from '../components/practice/QuestionNumberStrip.jsx'
import { IconSearch } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

function isAnswered(question, answer) {
  if (!question) return false
  if (question.type === 'mcq') return Number.isInteger(answer?.selected)
  return Boolean(String(answer?.text ?? '').trim())
}

function MarksLabel({ question }) {
  const marks = marksForQuestion(question)
  return <span className="text-xs tabular-nums text-muted">{marks} {marks === 1 ? 'mark' : 'marks'}</span>
}

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const storedSession = useStoredSession(userId, sessionId)
  const [draft, setDraft] = useState(() => getDraft(sessionId))
  // The session reaching storage is the first answer's job: until then it lives
  // here, so the recent list never offers a row that says "0 answered".
  const session = storedSession ?? draft

  const questions = useMemo(
    () => resolveQuestions(session?.questionIds ?? [], session?.questions ?? []),
    [session?.questionIds, session?.questions]
  )

  const firstOpen = useMemo(
    () => Math.max(0, questions.findIndex((question) => !isAnswered(question, session?.answers?.[question.question_id]))),
    [questions, session?.answers]
  )

  const [index, setIndex] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [resumed, setResumed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Resume at the first unanswered question, once, when the session loads.
  useEffect(() => {
    if (resumed || questions.length === 0) return
    setIndex(firstOpen)
    setResumed(true)
  }, [resumed, questions.length, firstOpen])

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'Practice', to: '/practice' }, { label: session?.label || 'Session' }])

  const current = questions[index] ?? null
  const answer = current ? session?.answers?.[current.question_id] : null

  const answeredCount = questions.filter((question) =>
    isAnswered(question, session?.answers?.[question.question_id])
  ).length

  // The first answer is what writes the session; before that it is only held in
  // memory, so the recent list never shows a session with nothing in it.
  const startIfUnstored = () => {
    if (getSession(userId, sessionId)) return
    const held = getDraft(sessionId)
    if (held) saveSession(userId, held)
    releaseDraft(sessionId)
  }

  const choose = (optionIndex) => {
    if (!current) return
    startIfUnstored()
    recordAnswer(userId, sessionId, current.question_id, {
      type: 'mcq',
      selected: optionIndex,
    })
  }

  const setText = (text) => {
    if (!current) return
    startIfUnstored()
    recordAnswer(userId, sessionId, current.question_id, { type: 'short', text })
  }

  // Clearing and flagging before the first answer edit the held record; they are
  // written with that answer rather than starting a session on their own.
  const updateDraft = (updater) => {
    setDraft((value) => {
      const next = updater(value ?? getDraft(sessionId))
      holdDraft(next)
      return next
    })
  }

  const clear = () => {
    if (!current) return
    if (storedSession) {
      clearAnswer(userId, sessionId, current.question_id)
      return
    }
    updateDraft((value) => {
      const answers = { ...value.answers }
      delete answers[current.question_id]
      return { ...value, answers }
    })
  }

  const flag = () => {
    if (!current) return
    if (storedSession) {
      toggleFlag(userId, sessionId, current.question_id)
      return
    }
    updateDraft((value) => ({
      ...value,
      flagged: value.flagged.includes(current.question_id)
        ? value.flagged.filter((id) => id !== current.question_id)
        : [...value.flagged, current.question_id],
    }))
  }

  const goPrevious = () => setIndex((value) => Math.max(0, value - 1))
  const goNext = () => setIndex((value) => Math.min(questions.length - 1, value + 1))

  // Number keys pick an option; arrow keys move between questions. Typing in a
  // field is left alone, or the short-answer box would fight the keyboard.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevious()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (/^[1-9]$/.test(event.key) && current?.type === 'mcq') {
        const optionIndex = Number(event.key) - 1
        if (optionIndex < (current.options?.length ?? 0)) {
          event.preventDefault()
          choose(optionIndex)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  const submit = async () => {
    // A session only reaches storage with its first answer, so an unanswered one
    // has nothing to submit and nothing to keep.
    if (!storedSession) {
      setConfirmOpen(false)
      navigate('/practice')
      return
    }

    setSubmitting(true)
    // Score MCQs immediately. Written AI-generated answers are deliberately
    // graded after navigation so a slow judge never blocks the results page.
    const pending = []
    for (const question of questions) {
      const answer = session.answers?.[question.question_id]

      if (question.origin === 'generated' && question.type !== 'mcq') {
        if (!session.selfMarks?.[question.question_id] && answer?.text) {
          pending.push({ question, answer })
        }
        continue
      }

      if (question.type !== 'mcq') continue
      const score = scoreOf(question, answer, null)
      if (score == null) continue
      recordScore(userId, {
        conceptId: question.conceptId,
        bloom: question.bloom_level,
        score,
        sessionId,
        questionId: question.question_id,
      })
    }

    submitSession(userId, sessionId)
    patchSession(userId, sessionId, {
      evaluationStatus: pending.length > 0 ? 'pending' : 'complete',
    })
    setSubmitting(false)
    setConfirmOpen(false)
    navigate(`/practice/${sessionId}/results`)

    if (pending.length > 0) {
      void Promise.all(
        pending.map(async ({ question, answer }) => {
          const grade = await gradeGeneratedAnswer(question, answer.text, userId)
          if (grade == null) return
          recordSelfMark(userId, sessionId, question.question_id, {
            score: grade.score,
            markedBy: 'model',
            feedback: grade.feedback,
          })
          recordScore(userId, {
            conceptId: question.conceptId,
            bloom: question.bloom_level,
            score: grade.score,
            sessionId,
            questionId: question.question_id,
          })
        })
      ).finally(() => {
        patchSession(userId, sessionId, { evaluationStatus: 'complete' })
      })
    }
  }

  const exit = () => {
    setExitOpen(false)
    if (session?.courseId) navigate(`/course/${session.courseId}`)
    else navigate('/practice')
  }

  if (!session) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="We could not find that session"
          description="It may have been removed, or the link may be out of date. Sessions are kept for the last twenty you start."
          actionLabel="Go to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  if (questions.length === 0) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="This session has no questions"
          description="The questions it drew are no longer in the course content. Start a new session from the course page."
          actionLabel="Back to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  const unanswered = questions.length - answeredCount
  const flaggedCount = session.flagged?.length ?? 0
  const summaryParts = []
  if (unanswered > 0) summaryParts.push(`${unanswered} unanswered`)
  if (flaggedCount > 0) summaryParts.push(`${flaggedCount} flagged`)
  const confirmMessage = summaryParts.length
    ? `${summaryParts.join(', ')}. Submit anyway?`
    : 'Every question has an answer. Submit?'

  const isLast = index === questions.length - 1

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-muted">
            Question {index + 1} of {questions.length}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted">
            {answeredCount} answered
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExitOpen(true)}>
          Exit practice
        </Button>
      </div>

      {session.note && (
        <p className="mt-3 rounded-panel border border-warning-tint bg-warning-tint px-3 py-2 text-xs text-warning">
          {session.note}
        </p>
      )}

      <QuestionNumberStrip
        className="mt-4"
        questions={questions}
        answers={session.answers}
        flagged={session.flagged}
        currentIndex={index}
        onJump={setIndex}
      />

      <PanelLarge className="mt-5">
        {current && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <BloomChip bloom={current.bloom_level} />
              <Badge tone="neutral" label={QUESTION_TYPE_LABELS[current.type] ?? current.type} />
              {current.origin === 'generated' && (
                <Badge tone="neutral" label={current.originLabel ?? 'Generated'} />
              )}
              <MarksLabel question={current} />
            </div>

            <p className="mt-4 text-base leading-relaxed text-ink">{current.question_text}</p>

            {current.type === 'mcq' ? (
              <fieldset className="mt-4">
                <legend className="sr-only">Choose one option</legend>
                <ul className="space-y-2">
                  {(current.options ?? []).map((option, optionIndex) => {
                    const selected = answer?.selected === optionIndex
                    return (
                      <li key={optionIndex}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors duration-150 ${
                            selected
                              ? 'border-primary bg-primary-tint'
                              : 'border-line hover:bg-surface-raised'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${current.question_id}`}
                            className="mt-0.5"
                            checked={selected}
                            onChange={() => choose(optionIndex)}
                          />
                          <span className="text-sm leading-relaxed text-ink">{option}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            ) : (
              <div className="mt-4">
                <Textarea
                  id={`answer-${current.question_id}`}
                  aria-label="Your answer"
                  rows={6}
                  placeholder="Write your answer…"
                  value={answer?.text ?? ''}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {current.type === 'mcq' && (
                <Button variant="ghost" size="sm" onClick={clear} disabled={!isAnswered(current, answer)}>
                  Clear answer
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={(session.flagged ?? []).includes(current.question_id)}
                onClick={flag}
              >
                {(session.flagged ?? []).includes(current.question_id) ? 'Flagged for review' : 'Flag for review'}
              </Button>
            </div>
          </>
        )}
      </PanelLarge>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={goPrevious} disabled={index === 0}>
          Previous
        </Button>
        {isLast ? (
          <Button onClick={() => setConfirmOpen(true)}>Review and submit</Button>
        ) : (
          <Button onClick={goNext}>Next</Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        title="Submit this session?"
        description={confirmMessage}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep practicing
            </Button>
            <Button onClick={submit} loading={submitting}>
              Submit
            </Button>
          </>
        }
      />

      <Dialog
        open={exitOpen}
        title="Exit practice?"
        description="Your answers are saved. You can come back to this session and pick up where you left off."
        onClose={() => setExitOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExitOpen(false)}>
              Stay
            </Button>
            <Button variant="secondary" onClick={exit}>
              Exit practice
            </Button>
          </>
        }
      />
    </div>
  )
}
