/**
 * PracticeHomePage — /practice.
 *
 * Free practice: the board at the top builds one session out of a subject, the
 * topics under it, a level and a length, with no menus in the way. Mastery and
 * question counts are shown per subject and per topic so the choice is made on
 * evidence rather than on a guess.
 *
 * The board builds its subjects and topics from the same library the session
 * will draw from (createRegistry over the loaded course trees), so a number on
 * the board is a number about the questions that will actually be asked.
 *
 * Practice here belongs to a concept, not to a course, so the board never
 * enrols anyone in anything: a session started this way is just questions.
 * "Mixed practice across my courses" stays available as a secondary button for
 * the student who wants everything at once.
 *
 * A session's score is worked out here the same way the results page works it
 * out - from the answers that have one - so the number on the list is the number
 * on the page. An unfinished session offers "Resume" (it is stored, so it picks
 * up where it stopped); a submitted one offers its results.
 *
 * The store keeps the last twenty sessions and nothing older, which the page says
 * rather than letting an old session look lost.
 */

import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCatalog } from '../hooks/useCatalog'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { usePracticeData } from '../hooks/usePracticeData.js'
import { useMastery } from '../lib/masteryStore.js'
import { useSessions } from '../lib/sessions.js'
import { useEnrollments } from '../lib/enrollment.js'
import { scoreSession } from '../lib/marks.js'
import { resolveQuestions, contentCourseIds } from '../content/practiceBank.js'
import { BOARD_DEFAULT_COUNT, DEFAULT_SESSION_COUNT } from '../lib/buildSession.js'
import { createRegistry, subjectLabel } from '../content/registry.js'
import { formatWhen, sentenceCase } from '../lib/text.js'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { EmptyState } from '../components/ui/EmptyState'
import { LevelControl } from '../components/practice/LevelControl.jsx'
import { CountControl } from '../components/practice/CountControl.jsx'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import { GeneratePanel } from '../components/practice/GeneratePanel.jsx'
import { Tabs } from '../components/ui/Tabs'
import { IconTarget, IconArrowRight } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

/**
 * The two ways to practise. "Question bank" is the board below - the authored
 * questions, chosen by subject and topic. "Pick a topic" is the generate form,
 * which used to be a page of its own at /generate; it is what the page opens on,
 * because naming what you are stuck on is the plainest way in.
 */
const TABS = [
  { value: 'topic', label: 'Pick a topic' },
  { value: 'bank', label: 'Question bank' },
]

const SCOPE_LABELS = {
  course: 'Course',
  topic: 'Topic',
  concept: 'Concept',
  mixed: 'Mixed',
  retry: 'Retry',
  custom: 'Chosen topics',
  generated: 'Generated',
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

function questionCountOf(count) {
  return `${count} question${count === 1 ? '' : 's'}`
}

function SessionRow({ session, title, onResume }) {
  // A generated session carries its own questions, so its row is read from them
  // as well; a session drawn from the bank keeps resolving against the content.
  const questions = useMemo(
    () => resolveQuestions(session.questionIds ?? [], session.questions ?? []),
    [session.questionIds, session.questions]
  )
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

/** One subject, with what it holds and what the student can do in it so far. */
function SubjectRow({ row, selected, onSelect }) {
  const mastery = row.mastery
  const empty = row.questionCount === 0

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        disabled={empty}
        onClick={() => onSelect(row.slug)}
        className={`w-full rounded-control border p-3 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          empty
            ? 'cursor-not-allowed border-line opacity-60'
            : selected
              ? 'border-primary bg-primary-tint'
              : 'border-line hover:bg-surface-raised'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-ink">{row.label}</span>
          <span className="text-xs tabular-nums text-muted">
            {empty ? 'No questions yet' : questionCountOf(row.questionCount)}
            {!empty && (
              <>
                {' · '}
                {mastery.value == null ? 'No estimate' : `${percent(mastery.value)} mastery`}
              </>
            )}
          </span>
        </div>
        {!empty && <p className="mt-0.5 text-xs text-muted">Based on {mastery.basedOn}.</p>}
      </button>
    </li>
  )
}

/** The topic checkboxes under a subject, with their own counts and estimates. */
function TopicChoices({ topics, excluded, onToggle }) {
  return (
    <ul className="space-y-1.5">
      {topics.map((topic) => {
        const empty = topic.questionCount === 0
        const checked = !empty && !excluded.has(topic.id)

        return (
          <li key={topic.id}>
            <label
              className={`flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 ${
                empty ? 'opacity-60' : 'cursor-pointer hover:bg-surface-raised'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={empty}
                  onChange={() => onToggle(topic.id)}
                />
                <span className="truncate text-[13px] text-ink">{sentenceCase(topic.title)}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {empty
                  ? 'No questions yet'
                  : `${questionCountOf(topic.questionCount)}${
                      topic.mastery.value == null ? '' : ` · ${percent(topic.mastery.value)}`
                    }`}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export default function PracticeHomePage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { data: catalog } = useCatalog()
  const sessions = useSessions(userId)
  const enrollments = useEnrollments(userId)
  const estimates = useMastery(userId)

  const courseIds = contentCourseIds()
  const { data: courses = [] } = usePracticeData(courseIds)

  const [subject, setSubject] = useState(null)
  const [excluded, setExcluded] = useState(() => new Set())
  const [level, setLevel] = useState('mixed')
  const [count, setCount] = useState(BOARD_DEFAULT_COUNT)
  const [label, setLabel] = useState('')
  const [tab, setTab] = useState('topic')

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'Practice' }])

  const titleById = useMemo(() => {
    const map = new Map()
    for (const course of Array.isArray(catalog) ? catalog : []) map.set(course.id, course.title)
    return map
  }, [catalog])

  // The library the board offers is built from the trees it will practise from,
  // so a subject here and a question there come from the same place.
  const library = useMemo(() => createRegistry(courses), [courses])

  const topicCounts = useMemo(() => {
    const map = new Map()
    for (const course of courses) {
      for (const topic of course.topics ?? []) {
        map.set(
          topic.id,
          (topic.concepts ?? []).reduce((sum, concept) => sum + (concept.questions?.length ?? 0), 0)
        )
      }
    }
    return map
  }, [courses])

  const subjectRows = useMemo(
    () =>
      library.subjects().map((slug) => {
        const topics = library.topicsOfSubject(slug).map((topic) => ({
          id: topic.id,
          title: topic.title,
          questionCount: topicCounts.get(topic.id) ?? 0,
          mastery: library.topicMastery(estimates, topic.id),
        }))
        return {
          slug,
          label: subjectLabel(slug),
          topics,
          questionCount: topics.reduce((sum, topic) => sum + topic.questionCount, 0),
          mastery: library.subjectMastery(estimates, slug),
        }
      }),
    [estimates, library, topicCounts]
  )

  const current = subjectRows.find((row) => row.slug === subject) ?? subjectRows[0] ?? null
  const chosenTopics = current
    ? current.topics.filter((topic) => topic.questionCount > 0 && !excluded.has(topic.id))
    : []
  const chosenCount = chosenTopics.reduce((sum, topic) => sum + topic.questionCount, 0)

  const enrolledCount = Object.keys(enrollments.courses ?? {}).length
  const titleFor = (courseId) =>
    courseId ? titleById.get(courseId) ?? sentenceCase(courseId) : 'Mixed practice'

  const selectSubject = (slug) => {
    setSubject(slug)
    setExcluded(new Set())
  }

  const toggleTopic = (topicId) => {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Practice</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">Practice, and see it add up</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Name a topic and the questions are written for it, or draw them from the courses you have.
        Marks and mastery come from what you answer, and nothing is measured until you do.
      </p>

      <Tabs className="mt-5" tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'topic' && (
        <div className="mt-5">
          <GeneratePanel />
        </div>
      )}

      {tab === 'bank' && (
        <>
          <PanelLarge className="mt-5">
            <h2 className="text-sm font-semibold text-ink">Build a practice session</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-muted">
              Pick a subject, keep the topics you want, choose a level and a length. Practice here is
              free: it never adds a course to My courses.
            </p>

            <div className="mt-4">
              <h3 className="text-[13px] font-medium text-ink">Subject</h3>
              {subjectRows.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted">No subjects have content yet.</p>
              ) : (
                <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {subjectRows.map((row) => (
                    <SubjectRow
                      key={row.slug}
                      row={row}
                      selected={row.slug === current?.slug}
                      onSelect={selectSubject}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <h3 className="text-[13px] font-medium text-ink">Topics</h3>
              {current === null || current.topics.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted">This subject has no topics yet.</p>
              ) : (
                <div className="mt-1.5">
                  <TopicChoices topics={current.topics} excluded={excluded} onToggle={toggleTopic} />
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <h3 className="text-[13px] font-medium text-ink">Level</h3>
                <LevelControl className="mt-1.5" value={level} onChange={setLevel} />
              </div>
              <div>
                <h3 className="text-[13px] font-medium text-ink">Number of questions</h3>
                <CountControl className="mt-1.5" value={count} onChange={setCount} />
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <Input
                id="practice-session-label"
                label="Label this session (optional)"
                placeholder="For example: paging before the quiz"
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <StartPracticeButton
                scope="custom"
                topicIds={chosenTopics.map((topic) => topic.id)}
                subject={current?.slug ?? null}
                sessionLabel={label.trim()}
                level={level}
                count={count}
                label={`Start practice (${chosenCount} question${chosenCount === 1 ? '' : 's'})`}
                emptyLabel="No questions yet"
              />
              <span className="text-xs text-muted">
                {chosenCount === 0
                  ? 'Tick at least one topic with questions.'
                  : `${questionCountOf(chosenCount)} available in the topics you kept.`}
              </span>
            </div>
          </PanelLarge>

          <Panel className="mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">Mixed practice across my courses</h2>
                <p className="mt-0.5 max-w-xl text-xs text-muted">
                  {enrolledCount > 0
                    ? `Six questions drawn from your ${enrolledCount} course${enrolledCount === 1 ? '' : 's'} in My courses, across every Bloom level.`
                    : 'Add a course to My courses and its questions become available here.'}
                </p>
              </div>
              <StartPracticeButton
                scope="mixed"
                label="Start mixed practice"
                emptyLabel={enrolledCount > 0 ? 'No questions yet' : 'Add a course first'}
                variant="secondary"
                count={DEFAULT_SESSION_COUNT}
              />
            </div>
          </Panel>

        </>
      )}

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
              description="Start a session above, or open a course and practice a topic or a concept."
            />
          </Panel>
        ) : (
          <Panel className="mt-3 px-5">
            <ul className="divide-y divide-line">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  title={session.label || titleFor(session.courseId)}
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
