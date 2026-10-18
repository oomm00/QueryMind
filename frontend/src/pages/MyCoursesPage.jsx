/**
 * MyCoursesPage — /courses.
 *
 * The courses a student has actually added, and what they know about each one.
 * Nothing is listed here that they did not enroll in, and every figure on a card
 * comes from their own answers: the goal and exam date they set, where they last
 * practised, how much of the course they have covered, and the estimated mastery
 * with the confidence behind it.
 *
 * A course with no content yet, or with no answers yet, says so in words rather
 * than showing a zero it cannot back up. The empty state is the honest one: if
 * the list is empty, the student has not enrolled in anything, and the way out is
 * the catalog.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCatalog } from '../hooks/useCatalog'
import { usePracticeData } from '../hooks/usePracticeData.js'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useEnrollments } from '../lib/enrollment.js'
import { useSessions } from '../lib/sessions.js'
import { useProgress } from '../lib/masteryStore.js'
import { courseStats, lastPractised } from '../lib/courseStats.js'
import { confidenceLine, masteryLabel, statusFor, toneClass } from '../components/map/conceptStatus.js'
import { formatWhen, sentenceCase } from '../lib/text.js'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import { IconLearning } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_started', label: 'Not started yet' },
  { value: 'completed', label: 'Completed' },
]

/** Which of the four tabs a course belongs to, from its real figures. */
function bucketOf(stats) {
  if (!stats || stats.concepts === 0) return 'not_started'
  if (stats.answers === 0) return 'not_started'
  if (stats.practised >= stats.concepts) return 'completed'
  return 'in_progress'
}

function CourseCard({ course, entry, stats, last, onOpen }) {
  const status = statusFor(stats?.mastery?.value ?? null)
  const StatusIcon = status.icon
  const coveragePct = stats?.coverage == null ? 0 : Math.round(stats.coverage * 100)
  const lastWhen = last?.at ? formatWhen(last.at) : null

  return (
    <Panel className="flex flex-col p-5">
      <button
        type="button"
        onClick={() => onOpen(course.id)}
        className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <h3 className="text-[15px] font-semibold leading-snug text-ink">{course.title}</h3>
      </button>

      {(entry?.goal || entry?.examDate) && (
        <div className="mt-2 space-y-0.5 text-xs text-muted">
          {entry?.goal && <p>Goal: <span className="text-ink">{entry.goal}</span></p>}
          {entry?.examDate && <p>Exam: <span className="text-ink">{entry.examDate}</span></p>}
        </div>
      )}

      <div className="mt-3 text-xs text-muted">
        {last ? (
          <p>
            Last practised:{' '}
            <span className="text-ink">
              {last.title ? sentenceCase(last.title) : 'this course'}
            </span>
            {lastWhen ? ` · ${lastWhen}` : ''}
          </p>
        ) : (
          <p>Not practised yet.</p>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Practice coverage</span>
          <span className="font-medium tabular-nums text-ink">
            {stats ? `${stats.practised} of ${stats.concepts} concepts` : 'No content yet'}
          </span>
        </div>
        <ProgressLine className="mt-1.5" percentage={coveragePct} />
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <StatusIcon size={13} aria-hidden="true" className={`mt-0.5 shrink-0 ${toneClass(status.tone)}`} />
          <span>
            {masteryLabel(stats?.mastery?.value ?? null)}
            {stats?.answers ? ` · ${confidenceLine(stats.mastery)}` : ''}
          </span>
        </p>
      </div>

      <div className="mt-4 flex-1" />
      <StartPracticeButton
        courseId={course.id}
        scope="course"
        label={stats?.answers > 0 ? 'Continue practice' : 'Start practice'}
        variant={stats?.answers > 0 ? 'primary' : 'secondary'}
        fullWidth
      />
    </Panel>
  )
}

export default function MyCoursesPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { data: catalog } = useCatalog()
  const enrollments = useEnrollments(userId)
  const savedSessions = useSessions(userId)
  const progress = useProgress(userId)
  const [tab, setTab] = useState('all')

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'My courses' }])

  const courseById = useMemo(() => {
    const map = new Map()
    for (const course of Array.isArray(catalog) ? catalog : []) map.set(course.id, course)
    return map
  }, [catalog])

  const enrolledIds = useMemo(() => Object.keys(enrollments.courses), [enrollments])
  const { data: trees = [] } = usePracticeData(enrolledIds)
  const treeById = useMemo(
    () => Object.fromEntries(trees.map((tree) => [tree.id, tree])),
    [trees]
  )

  const rows = useMemo(
    () =>
      enrolledIds.map((courseId) => {
        const entry = courseById.get(courseId) ?? null
        const tree = treeById[courseId] ?? null
        const stats = courseStats(tree, progress)
        return {
          course: {
            id: courseId,
            title: entry?.title ?? sentenceCase(courseId),
          },
          entry: enrollments.courses[courseId] ?? {},
          stats,
          last: lastPractised(tree, savedSessions, courseId),
          bucket: bucketOf(stats),
        }
      }),
    [enrolledIds, courseById, treeById, progress, enrollments, savedSessions]
  )

  const counts = useMemo(
    () => ({
      all: rows.length,
      in_progress: rows.filter((row) => row.bucket === 'in_progress').length,
      not_started: rows.filter((row) => row.bucket === 'not_started').length,
      completed: rows.filter((row) => row.bucket === 'completed').length,
    }),
    [rows]
  )

  const visible = rows
    .filter((row) => (tab === 'all' ? true : row.bucket === tab))
    .sort((a, b) => a.course.title.localeCompare(b.course.title))

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">My courses</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
        Your courses and what they know
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        The subjects you have added, with the goal you set and the progress your answers have
        produced.
      </p>

      {rows.length > 0 && (
        <>
          <Tabs
            className="mt-5 overflow-x-auto no-scrollbar"
            value={tab}
            onChange={setTab}
            tabs={TABS.map((item) => ({ ...item, label: `${item.label} ${counts[item.value]}` }))}
          />

          {visible.length === 0 ? (
            <Panel className="mt-4">
              <p className="text-[13px] text-muted">Nothing in this list yet.</p>
            </Panel>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {visible.map((row) => (
                <CourseCard
                  key={row.course.id}
                  course={row.course}
                  entry={row.entry}
                  stats={row.stats}
                  last={row.last}
                  onOpen={(id) => navigate(`/course/${id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {rows.length === 0 && (
        <Panel className="mt-5">
          <EmptyState
            icon={IconLearning}
            title="You haven't enrolled in a course yet"
            description="Enrolling adds a course here, and starts its practice. Nothing is added without you."
            actionLabel="Browse courses"
            onAction={() => navigate('/explore')}
          />
        </Panel>
      )}
    </div>
  )
}
