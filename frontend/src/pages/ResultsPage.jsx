/**
 * ResultsPage — /practice/:sessionId/results.
 *
 * The session, marked. The score is in the marks the questions are worth, and it
 * is only ever a score over the answers that have one: an unanswered question and
 * a short answer the student has not marked yet are left out of the total and
 * named, rather than quietly counted as wrong.
 *
 * Marking a short answer is the student's own job — there is no model in the
 * loop. They tick the rubric criteria their answer met, the rubric's share
 * becomes the score, and mastery moves once per (session, question) whichever way
 * they mark it. Everything they need to do that is here: their answer, the
 * author's answer key, the rubric and the explanation.
 *
 * The three ways out are the ones a student actually wants: retry just the
 * questions they missed, go back to the course, or practise what comes next.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useStoredSession, recordSelfMark } from '../lib/sessions.js'
import { recordScore } from '../lib/masteryStore.js'
import { marksForQuestion, scoreSession } from '../lib/marks.js'
import { rubricScore } from '../content/questionBank.js'
import { resolveQuestions } from '../content/practiceBank.js'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { PanelLarge } from '../components/ui/Panel.jsx'
import { ProgressLine } from '../components/ui/ProgressLine.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { BloomChip } from '../components/practice/BloomChip.jsx'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import { IconSearch } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'wrong', label: 'Wrong' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'flagged', label: 'Flagged' },
]

const STATUS_LABELS = {
  correct: { label: 'Correct', tone: 'success' },
  wrong: { label: 'Wrong', tone: 'danger' },
  unanswered: { label: 'Unanswered', tone: 'neutral' },
  unmarked: { label: 'Not marked yet', tone: 'warning' },
}

function percent(value) {
  return value == null ? null : `${Math.round(value * 100)}%`
}

function isAnswered(question, answer) {
  if (question.type === 'mcq') return Number.isInteger(answer?.selected)
  return Boolean(String(answer?.text ?? '').trim())
}

/** Correct, wrong, unanswered, or a written answer still waiting to be marked. */
function statusOf(question, answer, selfMark) {
  if (!isAnswered(question, answer)) return 'unanswered'
  if (question.type === 'mcq') {
    return answer.selected === question.correctIndex ? 'correct' : 'wrong'
  }
  if (!selfMark || typeof selfMark.score !== 'number') return 'unmarked'
  return selfMark.score >= 1 ? 'correct' : 'wrong'
}

function ReviewItem({ question, answer, selfMark, flagged, onToggleCriterion }) {
  const status = statusOf(question, answer, selfMark)
  const statusInfo = STATUS_LABELS[status]
  const marks = marksForQuestion(question)
  const rubric = question.rubric ?? []
  const met = new Set(selfMark?.metIndexes ?? [])
  const yourAnswer =
    question.type === 'mcq'
      ? Number.isInteger(answer?.selected)
        ? question.options?.[answer.selected] ?? ''
        : ''
      : String(answer?.text ?? '')

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <BloomChip bloom={question.bloom_level} />
        <Badge tone={statusInfo.tone} label={statusInfo.label} />
        {flagged && <Badge tone="warning" label="Flagged" />}
        <span className="text-xs tabular-nums text-muted">
          {marks} {marks === 1 ? 'mark' : 'marks'}
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-ink">{question.prompt}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-panel border border-line bg-surface-raised p-3">
          <p className="text-[11px] font-medium text-muted">Your answer</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            {yourAnswer ? yourAnswer : <span className="text-muted">Not answered</span>}
          </p>
        </div>
        <div className="rounded-panel border border-line bg-surface-raised p-3">
          <p className="text-[11px] font-medium text-muted">
            {question.type === 'mcq' ? 'Correct answer' : 'Answer key'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            {question.type === 'mcq'
              ? question.options?.[question.correctIndex] ?? ''
              : question.answerKey || 'No answer key was written for this question.'}
          </p>
        </div>
      </div>

      {question.explanation && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{question.explanation}</p>
      )}

      {question.type === 'short' && (
        <fieldset className="mt-3 rounded-panel border border-line p-3">
          <legend className="px-1 text-[11px] font-medium text-muted">Self-marked</legend>
          <p className="text-[11px] text-muted">
            Tick each criterion your answer met. Nothing marks this for you, so this is the number
            you say is fair.
          </p>

          {rubric.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {rubric.map((criterion, index) => (
                <li key={index}>
                  <label className="flex items-start gap-2 text-[13px] leading-relaxed text-ink">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={met.has(index)}
                      onChange={() => onToggleCriterion(index)}
                    />
                    <span>
                      {criterion.criterion}{' '}
                      <span className="text-muted">
                        ({criterion.points} {criterion.points === 1 ? 'point' : 'points'})
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">
              This question has no rubric, so it cannot be marked.
            </p>
          )}

          <p className="mt-2 text-xs tabular-nums text-muted">
            {selfMark && typeof selfMark.score === 'number'
              ? `${selfMark.earned} of ${selfMark.total} rubric points · ${percent(selfMark.score)}`
              : 'Not marked yet — left out of the score above.'}
          </p>
        </fieldset>
      )}
    </li>
  )
}

export default function ResultsPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const session = useStoredSession(userId, sessionId)
  const [filter, setFilter] = useState('all')

  useBreadcrumbs([
    WORKSPACE_CRUMB,
    { label: 'Practice', to: '/practice' },
    { label: 'Results' },
  ])

  const questions = useMemo(
    () => resolveQuestions(session?.questionIds ?? []),
    [session?.questionIds]
  )

  const score = useMemo(
    () => scoreSession(questions, session?.answers ?? {}, session?.selfMarks ?? {}),
    [questions, session?.answers, session?.selfMarks]
  )

  if (!session || questions.length === 0) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="We could not find those results"
          description="The session may have been removed, or the link may be out of date."
          actionLabel="Go to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  const flagged = new Set(session.flagged ?? [])
  const answers = session.answers ?? {}
  const selfMarks = session.selfMarks ?? {}

  const toggleCriterion = (question, index) => {
    const existing = selfMarks[question.question_id]
    const met = new Set(existing?.metIndexes ?? [])
    if (met.has(index)) met.delete(index)
    else met.add(index)

    const metIndexes = [...met].sort((a, b) => a - b)
    const result = rubricScore(question.rubric, metIndexes)
    const mark = { ...result, metIndexes }

    recordSelfMark(userId, sessionId, question.question_id, mark)
    recordScore(userId, {
      conceptId: question.conceptId,
      bloom: question.bloom_level,
      score: result.score,
      sessionId,
      questionId: question.question_id,
    })
  }

  const rows = questions
    .map((question) => ({
      question,
      answer: answers[question.question_id] ?? null,
      selfMark: selfMarks[question.question_id] ?? null,
      status: statusOf(question, answers[question.question_id] ?? null, selfMarks[question.question_id] ?? null),
    }))
    .filter((row) => {
      if (filter === 'wrong') return row.status === 'wrong'
      if (filter === 'unanswered') return row.status === 'unanswered'
      if (filter === 'flagged') return flagged.has(row.question.question_id)
      return true
    })

  const missed = questions
    .filter((question) => {
      const status = statusOf(question, answers[question.question_id] ?? null, selfMarks[question.question_id] ?? null)
      return status === 'wrong' || status === 'unanswered'
    })
    .map((question) => question.question_id)

  const unansweredCount = score.unscored.filter((entry) => entry.reason === 'unanswered').length
  const unmarkedCount = score.unscored.filter((entry) => entry.reason === 'not-marked').length
  const flaggedCount = flagged.size
  const scorePercent = percent(score.percent)

  return (
    <div className="mx-auto max-w-3xl">
      <PanelLarge>
        <p className="text-[11px] font-medium text-muted">Practice results</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-3xl font-semibold tabular-nums text-ink">
            {score.earned} of {score.available} marks
          </p>
          <p className="text-lg tabular-nums text-muted">{scorePercent ?? 'No score yet'}</p>
        </div>
        <ProgressLine className="mt-3" percentage={score.percent == null ? 0 : score.percent * 100} />

        <p className="mt-3 text-xs text-muted">
          {score.answered} of {score.total} answered
          {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ''}
        </p>

        {score.unscored.length > 0 && (
          <p className="mt-2 rounded-panel border border-line bg-surface-raised px-3 py-2 text-xs text-muted">
            {score.unscored.length} {score.unscored.length === 1 ? 'answer is' : 'answers are'} not in
            the score: {unansweredCount} unanswered
            {unmarkedCount > 0 ? `, ${unmarkedCount} written but not marked yet` : ''}. Mark the short
            answers below to count them.
          </p>
        )}
      </PanelLarge>

      <PanelLarge className="mt-4">
        <h2 className="text-sm font-semibold text-ink">By Bloom level</h2>
        <p className="mt-0.5 text-xs text-muted">Marks earned against the marks available at each level.</p>
        <ul className="mt-3 divide-y divide-line">
          {score.byLevel.map((level) => (
            <li key={level.level} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <BloomChip bloom={level.level} className="w-32 shrink-0 justify-between" />
              <div className="min-w-[120px] flex-1">
                <ProgressLine percentage={level.available > 0 ? (level.earned / level.available) * 100 : 0} />
              </div>
              <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ink">
                {level.earned} / {level.available}
              </span>
              <span className="w-20 shrink-0 text-right text-[11px] text-muted">
                {level.count} question{level.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      </PanelLarge>

      <PanelLarge className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Review</h2>
          <span className="text-xs tabular-nums text-muted">
            {rows.length} of {questions.length}
          </span>
        </div>

        <Tabs className="mt-3" value={filter} onChange={setFilter} tabs={FILTERS} />

        {rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">Nothing here under this filter.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {rows.map((row) => (
              <ReviewItem
                key={row.question.question_id}
                question={row.question}
                answer={row.answer}
                selfMark={row.selfMark}
                flagged={flagged.has(row.question.question_id)}
                onToggleCriterion={(index) => toggleCriterion(row.question, index)}
              />
            ))}
          </ul>
        )}
      </PanelLarge>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {missed.length > 0 && (
          <StartPracticeButton
            courseId={session.courseId}
            scope="retry"
            questionIds={missed}
            count={missed.length}
            label="Retry the questions I missed"
          />
        )}
        <Button variant="secondary" onClick={() => navigate(`/course/${session.courseId}`)}>
          Back to course
        </Button>
        <StartPracticeButton
          courseId={session.courseId}
          scope="course"
          label="Practice next topic"
          variant="ghost"
        />
      </div>
    </div>
  )
}
