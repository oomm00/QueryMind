/**
 * CourseOutline — the left column of the lesson workspace.
 *
 * Whole-course completion, a "Find in this course" filter, a link to the topic
 * map, expandable topics, concepts with a completion status icon, and the
 * current concept's lessons nested underneath.
 *
 * Each topic node loads its own concepts with useTopic, so the outline never
 * needs one large payload and a topic stays lazy until it is expanded.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { sentenceCase } from '../../lib/text'
import { Input } from '../ui/Input'
import { ProgressLine } from '../ui/ProgressLine'
import { Skeleton } from '../ui/Skeleton'
import { buttonClasses } from '../ui/Button'
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconTarget,
} from '../ui/Icons'
import { useTopic } from '../../hooks/useTopic'
import { useLessonProgress } from '../../content/lessonProgress.js'

/** Completion of one concept across its lessons. */
function conceptState(lessons, completed) {
  if (!lessons || lessons.length === 0) return 'empty'
  const done = lessons.filter((lesson) => completed[lesson.id]).length
  if (done === 0) return 'not_started'
  return done === lessons.length ? 'complete' : 'in_progress'
}

const STATUS_LABEL = {
  complete: 'Completed',
  in_progress: 'In progress',
  not_started: 'Not started',
  empty: 'No lessons yet',
}

function ConceptStatus({ state }) {
  const base = 'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full'

  return (
    <span className={cx(base, state === 'complete' && 'bg-success-tint text-success', state === 'in_progress' && 'border-2 border-primary', (state === 'not_started' || state === 'empty') && 'border border-line-strong')}>
      {state === 'complete' && <IconCheck size={11} />}
      <span className="sr-only">{STATUS_LABEL[state]}</span>
    </span>
  )
}

function TopicNode({ courseId, topic, isCurrent, conceptId, currentLessonId, needle, onNavigate }) {
  const { data, isLoading } = useTopic(topic.id)
  const progress = useLessonProgress()
  const [expanded, setExpanded] = useState(isCurrent)
  const [openConcepts, setOpenConcepts] = useState({})

  useEffect(() => {
    if (isCurrent) setExpanded(true)
  }, [isCurrent])

  const concepts = useMemo(() => data?.concepts ?? [], [data])

  const visible = useMemo(() => {
    if (!needle) return concepts
    return concepts.filter(
      (concept) =>
        concept.title.toLowerCase().includes(needle) ||
        concept.lessons.some((lesson) => lesson.title.toLowerCase().includes(needle))
    )
  }, [concepts, needle])

  const isOpen = expanded || Boolean(needle)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {isOpen ? (
          <IconChevronDown size={14} className="shrink-0 text-muted" />
        ) : (
          <IconChevronRight size={14} className="shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate">{sentenceCase(topic.title)}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">{topic.lessonCount}</span>
      </button>

      {isOpen && (
        <div className="mt-0.5 space-y-0.5 pl-3">
          {isLoading && <Skeleton className="h-6 w-full" />}

          {!isLoading && visible.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted">No concepts yet.</p>
          )}

          {visible.map((concept) => {
            const state = conceptState(concept.lessons, progress.completed)
            const isCurrentConcept = concept.id === conceptId
            const matchedLessons = needle
              ? concept.lessons.filter((lesson) => lesson.title.toLowerCase().includes(needle))
              : []
            const showLessons =
              isCurrentConcept || Boolean(openConcepts[concept.id]) || matchedLessons.length > 0
            const first = concept.lessons[0]

            return (
              <div key={concept.id}>
                <div className="flex items-center gap-1">
                  {concept.lessons.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenConcepts((current) => ({
                          ...current,
                          [concept.id]: !current[concept.id],
                        }))
                      }
                      aria-expanded={showLessons}
                      aria-label={`${showLessons ? 'Hide' : 'Show'} lessons in ${sentenceCase(concept.title)}`}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {showLessons ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" aria-hidden="true" />
                  )}

                  {first ? (
                    <Link
                      to={`/learn/${courseId}/${topic.id}/${first.id}`}
                      onClick={onNavigate}
                      className={cx(
                        'flex min-w-0 flex-1 items-start gap-2 rounded-control px-1.5 py-1.5 text-[13px] transition-colors',
                        isCurrentConcept
                          ? 'bg-primary-tint font-medium text-primary'
                          : 'text-ink hover:bg-surface-raised'
                      )}
                    >
                      <ConceptStatus state={state} />
                      <span className="min-w-0 flex-1 truncate">{sentenceCase(concept.title)}</span>
                    </Link>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-start gap-2 px-1.5 py-1.5 text-[13px] text-muted">
                      <ConceptStatus state={state} />
                      <span className="min-w-0 flex-1 truncate">{sentenceCase(concept.title)}</span>
                    </span>
                  )}
                </div>

                {showLessons && (
                  <div className="ml-6 space-y-0.5 border-l border-line pl-2">
                    {concept.lessons.map((lesson) => (
                      <NavLink
                        key={lesson.id}
                        to={`/learn/${courseId}/${topic.id}/${lesson.id}`}
                        onClick={onNavigate}
                        className={cx(
                          'flex items-center gap-2 rounded-control px-2 py-1.5 text-[13px] transition-colors',
                          lesson.id === currentLessonId && 'bg-primary-tint font-medium text-primary',
                          lesson.id !== currentLessonId &&
                            'text-muted hover:bg-surface-raised hover:text-ink'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                        {lesson.isPlaceholder && (
                          <span className="shrink-0 text-[10px] text-muted">Not written</span>
                        )}
                        {progress.completed[lesson.id] && (
                          <IconCheck size={12} className="shrink-0 text-success" />
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CourseOutline({
  courseId,
  course,
  topicId,
  conceptId,
  currentLessonId,
  onNavigate,
}) {
  const [query, setQuery] = useState('')
  const progress = useLessonProgress()

  const allLessonIds = useMemo(
    () => course.topics.flatMap((topic) => topic.lessonIds ?? []),
    [course]
  )
  const doneCount = allLessonIds.filter((id) => progress.completed[id]).length
  const completion = allLessonIds.length ? (doneCount / allLessonIds.length) * 100 : 0
  const needle = query.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-0">
      <div>
        <p className="text-sm font-semibold text-ink">{course.title}</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted">Completion</span>
          <span className="font-medium tabular-nums text-ink">{Math.round(completion)}%</span>
        </div>
        <ProgressLine className="mt-1.5" percentage={completion} />
        <p className="mt-1.5 text-[11px] text-muted">
          {doneCount} of {allLessonIds.length} lessons reviewed
        </p>
      </div>

      <div className="relative">
        <IconSearch
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find in this course"
          aria-label="Find in this course"
        />
      </div>

      <Link
        to={`/map/${courseId}/${topicId}`}
        onClick={onNavigate}
        className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
      >
        <IconTarget size={15} />
        View topic map
      </Link>

      <nav aria-label="Course outline" className="space-y-0.5">
        {course.topics.map((topic) => (
          <TopicNode
            key={topic.id}
            courseId={courseId}
            topic={topic}
            isCurrent={topic.id === topicId}
            conceptId={conceptId}
            currentLessonId={currentLessonId}
            needle={needle}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {needle && (
        <p className="text-[11px] text-muted">
          Showing matches only. Clear the filter to browse the full course.
        </p>
      )}
    </div>
  )
}

export default CourseOutline
