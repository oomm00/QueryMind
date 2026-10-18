/**
 * PracticeHomePage — /practice.
 *
 * Where practice starts when it is not about one course in particular: a mixed
 * session across every course in My courses, and the sessions already started.
 *
 * A session's score is worked out here the same way the results page works it
 * out - from the answers that have one - so the number on the list is the number
 * on the page. An unfinished session offers "Resume" (it is stored, so it picks
 * up where it stopped); a submitted one offers its results.
 *
 * The store keeps the last twenty sessions and nothing older, which the page says
 * rather than letting an old session look lost.
 */

import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCatalog } from '../hooks/useCatalog'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useSessions } from '../lib/sessions.js'
import { useEnrollments } from '../lib/enrollment.js'
import { scoreSession } from '../lib/marks.js'
import { resolveQuestions } from '../content/practiceBank.js'
import { formatWhen, sentenceCase } from '../lib/text.js'
import { Badge } from '../components/ui/Badge'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { EmptyState } from '../components/ui/EmptyState'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import { IconTarget, IconArrowRight } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const SCOPE_LABELS = {
  course: 'Course',
  topic: 'Topic',
  concept: 'Concept',
  mixed: 'Mixed',
  retry: 'Retry',
}

const LEVEL_LABELS = {
  mixed: 'Mixed',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

function percent(value) {
  return value == null ? null : `${Math.round(value * 100)}%`
}

function SessionRow({ session, title, onResume }) {
  const questions = useMemo(() => resolveQuestions(session.questionIds ?? []), [session.questionIds])
  const score = useMemo(
    () => scoreSession(questions, session.answers ?? {}, session.selfMarks ?? {}),
    [questions, session.answers, session.selfMarks]
  )

  const unfinished = session.status !== 'submitted'
  const when = formatWhen(session.createdAt)
  const answered = Object.keys(session.answers ?? {}).length

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <Badge tone="neutral" label={SCOPE_LABELS[session.scope] ?? sentenceCase(session.scope ?? '')} />
          {unfinished && <Badge tone="warning" label="In progress" />}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {LEVEL_LABELS[session.level] ?? sentenceCase(session.level ?? '')} level ·{' '}
          {questions.length} question{questions.length === 1 ? '' : 's'} ·{' '}
          {answered} answered
          {when ? ` · ${when}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[13px] tabular-nums text-ink">
          {score.available > 0 ? (
            <>
              {score.earned} of {score.available} {score.available === 1 ? 'mark' : 'marks'}{' '}
              <span className="text-muted">· {percent(score.percent)}</span>
            </>
          ) : (
            <span className="text-muted">No score yet</span>
          )}
        </span>
        {unfinished ? (
          <button
            type="button"
            onClick={() => onResume(session.id)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Resume
            <IconArrowRight size={13} aria-hidden="true" />
          </button>
        ) : (
          <Link
            to={`/practice/${session.id}/results`}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Results
            <IconArrowRight size={13} aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  )
}

export default function PracticeHomePage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { data: catalog } = useCatalog()
  const sessions = useSessions(userId)
  const enrollments = useEnrollments(userId)

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'Practice' }])

  const titleById = useMemo(() => {
    const map = new Map()
    for (const course of Array.isArray(catalog) ? catalog : []) map.set(course.id, course.title)
    return map
  }, [catalog])

  const enrolledCount = Object.keys(enrollments.courses ?? {}).length
  const titleFor = (courseId) =>
    courseId ? titleById.get(courseId) ?? sentenceCase(courseId) : 'Mixed practice'

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Practice</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Practise, and see it add up</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Every session is drawn from the questions in your courses. Marks and mastery come from what
        you answer, and nothing is measured until you do.
      </p>

      <PanelLarge className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Mixed practice across my courses</h2>
            <p className="mt-0.5 max-w-xl text-xs text-muted">
              {enrolledCount > 0
                ? `Six questions drawn from all ${enrolledCount} course${enrolledCount === 1 ? '' : 's'} in My courses, across every Bloom level.`
                : 'Add a course to My courses and its questions become available here.'}
            </p>
          </div>
          <StartPracticeButton
            scope="mixed"
            label="Start mixed practice"
            emptyLabel={enrolledCount > 0 ? 'No questions yet' : 'Add a course first'}
          />
        </div>
      </PanelLarge>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Recent sessions</h2>
          <span className="text-xs text-muted">The last twenty you start are kept.</span>
        </div>

        {sessions.length === 0 ? (
          <Panel className="mt-3">
            <EmptyState
              icon={IconTarget}
              title="No practice sessions yet"
              description="Start a mixed session above, or open a course and practise a topic or a concept."
            />
          </Panel>
        ) : (
          <Panel className="mt-3 px-5">
            <ul className="divide-y divide-line">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  title={titleFor(session.courseId)}
                  onResume={(id) => navigate(`/practice/${id}`)}
                />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}
