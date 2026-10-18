/**
 * ResultsPage — /practice/:sessionId/results.
 *
 * What a submitted session scored, in marks and percent, split by Bloom level
 * and by question. MCQs were scored on submit (see SessionPage: it called
 * recordScore the moment the student hit Review and submit). Short answers are
 * scored here: the student marks each rubric criterion they met, the rubric
 * share becomes the score, and that score moves mastery the same way an mcq
 * does.
 *
 * The score is based only on questions that have a score so far: an unanswered
 * mcq and a short answer that is not marked yet are excluded from the
 * denominator and reported as unscored. When every short answer is marked the
 * percentage moves to 100% of what the session was worth; before that it stays
 * under 100% with a note, and the page tells the student which questions are
 * still open.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { usePracticeData } from '../hooks/usePracticeData.js'
import { usePracticeContext } from '../hooks/usePracticeContext.js'
import { recordSelfMark, useStoredSession } from '../lib/sessions.js'
import { recordScore } from '../lib/masteryStore.js'
import { marksForQuestion, scoreOf, scoreSession } from '../lib/marks.js'
import { resolveQuestions } from '../content/practiceBank.js'
import { rubricScore, QUESTION_TYPE_LABELS } from '../content/questionBank.js'
import { nextTopicOf } from '../lib/buildSession.js'
import { PanelLarge } from '../components/ui/Panel'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { BloomChip, bloomLabel } from '../components/practice/BloomChip.jsx'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import { IconSearch } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'wrong', label: 'Wrong' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'flagged', label: 'Flagged' },
]

/** A count of marks or a percentage: whole where it is whole, one decimal where it is not. */
function formatAmount(value) {
  if (value == null) return ''
  return value === Math.floor(value) ? String(Math.floor(value)) : value.toFixed(1)
}

/** "1 mark" or "2 marks". */
function marksLabel(count) {
  return `${count} ${count === 1 ? 'mark' : 'marks'}`
}

function RubricSelfMark({ userId, sessionId, question, answer, selfMark, onUpdate }) {
  const rubric = question.rubric ?? []
  const met = new Set(selfMark?.met ?? [])
  const { earned, total } = rubricScore(rubric, [...met])

  const toggle = (index) => {
    const next = new Set(met)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    const metArray = [...next]
    const { score } = rubricScore(rubric, metArray)
    const mark = { met: metArray, score }
    recordSelfMark(userId, sessionId, question.question_id, mark)
    recordScore(userId, {
      conceptId: question.conceptId,
      bloom: question.bloom_level,
      score,
      sessionId,
      questionId: question.question_id,
    })
    onUpdate()
  }

  return (
    <div className="mt-4 space-y-3">
      {selfMark && (
        <p className="text-sm text-muted">
          {earned} of {total} rubric {total === 1 ? 'point' : 'points'}
        </p>
      )}
      {rubric.map((criterion, index) => (
        <label
          key={index}
          className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-surface-raised p-3 transition-colors duration-150 hover:bg-surface"
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={met.has(index)}
            onChange={() => toggle(index)}
            aria-label={`${criterion.criterion} (${criterion.points} ${criterion.points === 1 ? 'point' : 'points'})`}
          />
          <div className="flex-1">
            <p className="text-sm leading-relaxed text-ink">{criterion.criterion}</p>
            <p className="mt-1 text-xs tabular-nums text-muted">{criterion.points} {criterion.points === 1 ? 'point' : 'points'}</p>
          </div>
        </label>
      ))}
    </div>
  )
}

function QuestionReview({ userId, sessionId, question, answer, selfMark, flagged, onUpdate }) {
  const marks = marksForQuestion(question)
  const score = scoreOf(question, answer, selfMark)
  const earned = score != null ? marks * score : null
  const earnedDisplay = earned != null ? formatAmount(earned) : null
  const isCorrect = question.type === 'mcq' && score === 1
  const isWrong = question.type === 'mcq' && score === 0
  const isAnswered = question.type === 'mcq'
    ? Number.isInteger(answer?.selected)
    : Boolean(String(answer?.text ?? '').trim())

  return (
    <PanelLarge className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BloomChip bloom={question.bloom_level} />
        <Badge tone="neutral" label={QUESTION_TYPE_LABELS[question.type] ?? question.type} />
        {flagged && <Badge tone="warning" label="Flagged" />}
        <span className="text-xs tabular-nums text-muted">
          {earnedDisplay != null
            ? `${earnedDisplay} of ${marksLabel(marks)}`
            : marksLabel(marks)}
        </span>
      </div>

      <div>
        <p className="text-sm font-medium text-muted">Question</p>
        <p className="mt-1 text-base leading-relaxed text-ink">{question.question_text}</p>
      </div>

      {question.type === 'mcq' ? (
        <>
          <div>
            <p className="text-sm font-medium text-muted">Your answer</p>
            <div className={`mt-1 rounded-control border p-3 ${
              isCorrect
                ? 'border-success bg-success-tint'
                : isWrong
                ? 'border-danger bg-danger-tint'
                : 'border-line bg-surface-raised'
            }`}>
              {isAnswered ? (
                <p className="text-sm leading-relaxed text-ink">{question.options?.[answer.selected]}</p>
              ) : (
                <p className="text-sm italic text-muted">Unanswered</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted">Correct answer</p>
            <div className="mt-1 rounded-control border border-success bg-success-tint p-3">
              <p className="text-sm leading-relaxed text-ink">{question.options?.[question.correctIndex]}</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium text-muted">Your answer</p>
            <div className="mt-1 rounded-control border border-line bg-surface-raised p-3">
              {isAnswered ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{answer.text}</p>
              ) : (
                <p className="text-sm italic text-muted">Unanswered</p>
              )}
            </div>
          </div>

          {isAnswered && (
            <>
              <div>
                <p className="text-sm font-medium text-muted">Answer key</p>
                <div className="mt-1 rounded-control border border-line bg-surface-raised p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{question.answerKey}</p>
                </div>
              </div>

              {question.rubric && question.rubric.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-muted">Self-marked rubric</p>
                  {!selfMark && (
                    <p className="mt-2 rounded-control border border-warning-tint bg-warning-tint px-3 py-2 text-xs text-warning">
                      Not marked yet — left out of the score above
                    </p>
                  )}
                  <RubricSelfMark
                    userId={userId}
                    sessionId={sessionId}
                    question={question}
                    answer={answer}
                    selfMark={selfMark}
                    onUpdate={onUpdate}
                  />
                </div>
              ) : (
                <p className="rounded-control border border-warning-tint bg-warning-tint px-3 py-2 text-xs text-warning">
                  This question has no rubric. The instructor will grade it manually.
                </p>
              )}
            </>
          )}
        </>
      )}

      {question.explanation && (
        <div>
          <p className="text-sm font-medium text-muted">Explanation</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{question.explanation}</p>
        </div>
      )}
    </PanelLarge>
  )
}

export default function ResultsPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const session = useStoredSession(userId, sessionId)
  const [filter, setFilter] = useState('all')
  const [updateCount, setUpdateCount] = useState(0)

  const questions = useMemo(
    () => resolveQuestions(session?.questionIds ?? []),
    [session?.questionIds]
  )

  const score = useMemo(
    () => scoreSession(questions, session?.answers ?? {}, session?.selfMarks ?? {}),
    [questions, session?.answers, session?.selfMarks, updateCount]
  )

  const { data: courses = [] } = usePracticeData(session?.courseId ? [session.courseId] : [])
  const context = usePracticeContext(userId)
  const course = courses[0] ?? null
  const nextTopic = useMemo(
    () => course ? nextTopicOf(course, context) : null,
    [course, context]
  )

  useBreadcrumbs([
    WORKSPACE_CRUMB,
    { label: 'Practice', to: '/practice' },
    { label: 'Session', to: `/practice/${sessionId}` },
    { label: 'Results' },
  ])

  const filtered = useMemo(() => {
    const flaggedSet = new Set(session?.flagged ?? [])
    return questions.filter((question) => {
      const answer = session?.answers?.[question.question_id]
      const selfMark = session?.selfMarks?.[question.question_id]
      const score = scoreOf(question, answer, selfMark)
      const isAnswered = question.type === 'mcq'
        ? Number.isInteger(answer?.selected)
        : Boolean(String(answer?.text ?? '').trim())

      if (filter === 'all') return true
      if (filter === 'wrong') return question.type === 'mcq' && score === 0
      if (filter === 'unanswered') return !isAnswered
      if (filter === 'flagged') return flaggedSet.has(question.question_id)
      return true
    })
  }, [questions, session?.answers, session?.selfMarks, session?.flagged, filter])

  const missedIds = useMemo(() => {
    return questions
      .filter((question) => {
        const answer = session?.answers?.[question.question_id]
        const selfMark = session?.selfMarks?.[question.question_id]
        const score = scoreOf(question, answer, selfMark)
        return question.type === 'mcq' && score === 0
      })
      .map((question) => question.question_id)
  }, [questions, session?.answers, session?.selfMarks])

  if (!session) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="We could not find that session"
          description="It may have been removed, or the link may be out of date."
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
          description="The questions it drew are no longer in the course content."
          actionLabel="Back to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  const percent = score.percent != null ? formatAmount(Math.round(score.percent * 1000) / 10) : null
  const hasUnscored = score.unscored.length > 0
  const unscoredUnanswered = score.unscored.filter(item => item.reason === 'unanswered').length
  const unscoredNotMarked = score.unscored.filter(item => item.reason === 'not-marked').length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PanelLarge className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Practice results</h1>
          <p className="mt-1 text-sm text-muted">{questions.length} {questions.length === 1 ? 'question' : 'questions'}</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-raised p-4">
          {percent != null ? (
            <>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-semibold tabular-nums text-ink">
                  {formatAmount(score.earned)}<span className="text-2xl text-muted">/{score.available}</span>
                </p>
                <p className="text-xl font-medium tabular-nums text-muted">{percent}%</p>
              </div>
              <p className="mt-1 text-sm text-muted">Marks earned</p>
            </>
          ) : (
            <p className="text-lg font-medium text-muted">No score yet</p>
          )}
          {hasUnscored && (
            <p className="mt-2 text-sm text-muted">
              {score.unscored.length} {score.unscored.length === 1 ? 'answer is' : 'answers are'} not in the score: {unscoredUnanswered} unanswered{unscoredNotMarked > 0 && `, ${unscoredNotMarked} written but not marked yet`}
            </p>
          )}
        </div>

        {score.byLevel.length > 0 && (
          <div>
            <p className="text-sm font-medium text-ink">By Bloom level</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 pr-4 font-medium text-muted">Level</th>
                    <th className="pb-2 pr-4 text-right font-medium text-muted">Earned</th>
                    <th className="pb-2 pr-4 text-right font-medium text-muted">Available</th>
                    <th className="pb-2 text-right font-medium text-muted">Percent</th>
                  </tr>
                </thead>
                <tbody>
                  {score.byLevel.map((row) => {
                    const pct = row.available > 0 ? ((row.earned / row.available) * 100).toFixed(0) : '0'
                    return (
                      <tr key={row.level} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4">
                          <span className="text-ink">{bloomLabel(row.level)}</span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ink">{formatAmount(row.earned)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-ink">{row.available}</td>
                        <td className="py-2 text-right tabular-nums text-ink">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PanelLarge>

      <div>
        <div className="flex items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                filter === item.value
                  ? 'border-primary bg-primary-tint text-primary'
                  : 'border-line bg-surface text-muted hover:bg-surface-raised'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((question) => (
          <QuestionReview
            key={question.question_id}
            userId={userId}
            sessionId={sessionId}
            question={question}
            answer={session.answers?.[question.question_id]}
            selfMark={session.selfMarks?.[question.question_id]}
            flagged={(session.flagged ?? []).includes(question.question_id)}
            onUpdate={() => setUpdateCount(c => c + 1)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        {missedIds.length > 0 && (
          <StartPracticeButton
            courseId={session.courseId}
            scope="retry"
            level={session.level}
            questionIds={missedIds}
            label="Retry the questions I missed"
            variant="primary"
          />
        )}
        {session.courseId && (
          <Button variant="secondary" onClick={() => navigate(`/course/${session.courseId}`)}>
            Back to course
          </Button>
        )}
        {nextTopic && (
          <StartPracticeButton
            courseId={session.courseId}
            scope="topic"
            scopeId={nextTopic.id}
            level={session.level}
            label={`Practice next topic: ${nextTopic.title}`}
            variant="secondary"
          />
        )}
      </div>
    </div>
  )
}
