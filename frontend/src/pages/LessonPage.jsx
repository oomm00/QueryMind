/**
 * LessonPage — /learn/:courseId/:topicId/:lessonId
 *
 * The reading workspace (Figma frame "Learning — paging reading workspace" and
 * its dark / tablet / mobile variants).
 *
 *   left   course outline — completion, find-in-course, topic map, topics
 *   centre lesson reader — meta, objectives, blocks, prev/next
 *   right  topic intelligence — mastery, confidence, prerequisites, next action
 *
 * Both side panels are static sticky columns from lg upwards and drawers below
 * it; the intelligence panel only starts expanded from xl, since three columns
 * at 1024 squeeze the reader. Below md the previous/next controls move into a
 * sticky bottom bar. All three columns share one element each, so panel state is
 * never duplicated.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useCourse } from '../hooks/useCourse'
import { useTopic } from '../hooks/useTopic'
import { useConcept } from '../hooks/useConcept'
import { useLesson } from '../hooks/useLesson'
import { SidePanel } from '../components/lesson/SidePanel'
import { CourseOutline } from '../components/lesson/CourseOutline'
import { LessonReader } from '../components/lesson/LessonReader'
import { TopicIntelligence } from '../components/lesson/TopicIntelligence'
import { LessonWorkspaceSkeleton } from '../components/lesson/LessonWorkspaceSkeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Panel } from '../components/ui/Panel'
import { buttonClasses } from '../components/ui/Button'
import { IconExplore } from '../components/ui/Icons'

export default function LessonPage() {
  const { courseId = 'os', topicId, lessonId } = useParams()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isWide = useMediaQuery('(min-width: 1280px)')

  const courseQuery = useCourse(courseId)
  const topicQuery = useTopic(topicId, courseId)
  const lessonQuery = useLesson(lessonId)

  const course = courseQuery.data
  const topic = topicQuery.data
  const lesson = lessonQuery.data

  // The URL carries only the lesson, so the owning concept is found by search.
  const concept = useMemo(() => {
    if (!topic || !lesson) return null
    return topic.concepts.find((item) => item.lessons.some((item2) => item2.id === lesson.id)) ?? null
  }, [topic, lesson])

  const conceptQuery = useConcept(concept?.id)

  // Three columns from lg, but the intelligence panel only starts expanded from
  // xl. Between 1024 and 1279 it would squeeze the reader under 400px, so it
  // starts collapsed and stays one click away in the reader header.
  const [outlineOpen, setOutlineOpen] = useState(isDesktop)
  const [intelOpen, setIntelOpen] = useState(isWide)

  // Pull a panel back to its default when its breakpoint is crossed; a manual
  // toggle is respected until then.
  useEffect(() => {
    setOutlineOpen(isDesktop)
  }, [isDesktop])

  useEffect(() => {
    setIntelOpen(isWide)
  }, [isWide])

  const siblings = concept?.lessons ?? []

  const { position, prev, next } = useMemo(() => {
    if (!lesson || siblings.length === 0) return { position: null, prev: null, next: null }

    const index = siblings.findIndex((item) => item.id === lesson.id)
    if (index === -1) return { position: null, prev: null, next: null }

    const toTarget = (item) =>
      item ? { to: `/learn/${courseId}/${topicId}/${item.id}`, title: item.title } : null

    let before = index > 0 ? siblings[index - 1] : null
    let after = index < siblings.length - 1 ? siblings[index + 1] : null

    // Continue across the concept boundary within the same topic, so reading
    // order never dead-ends part-way through a topic.
    const conceptIndex = topic ? topic.concepts.findIndex((item) => item.id === concept?.id) : -1
    if (!before && conceptIndex > 0) {
      const previousConcept = topic.concepts[conceptIndex - 1].lessons
      before = previousConcept[previousConcept.length - 1] ?? null
    }
    if (!after && conceptIndex >= 0 && conceptIndex < topic.concepts.length - 1) {
      after = topic.concepts[conceptIndex + 1].lessons[0] ?? null
    }

    return {
      position: { index, total: siblings.length },
      prev: toTarget(before),
      next: toTarget(after),
    }
  }, [lesson, siblings, topic, concept, courseId, topicId])

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: course?.title ?? 'Course', to: `/course/${courseId}` },
    ...(topic ? [{ label: topic.title }] : []),
    ...(lesson ? [{ label: lesson.title }] : []),
  ])

  const error = courseQuery.error || topicQuery.error || lessonQuery.error
  const loading = courseQuery.isLoading || topicQuery.isLoading || lessonQuery.isLoading

  const retry = () => {
    courseQuery.refetch()
    topicQuery.refetch()
    lessonQuery.refetch()
    conceptQuery.refetch()
  }

  // Only close a panel on navigation when it is a drawer, never a column.
  const closeOnNavigate = (setter) => () => {
    if (!isDesktop) setter(false)
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load this lesson"
        message={error.message || 'The content request failed.'}
        onRetry={retry}
      />
    )
  }

  if (loading) return <LessonWorkspaceSkeleton />

  if (!course || !topic || !lesson) {
    return (
      <EmptyState
        icon={IconExplore}
        title="Lesson not found"
        description="This course, topic or lesson does not exist in the content set. It may have been renamed or removed."
        action={
          <Link to="/explore" className={buttonClasses({ size: 'sm' })}>
            Back to Explore
          </Link>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <SidePanel
        open={outlineOpen}
        onClose={() => setOutlineOpen(false)}
        side="left"
        label="Course outline"
        className="lg:w-[208px] xl:w-[248px]"
      >
        <CourseOutline
          courseId={courseId}
          course={course}
          topicId={topicId}
          conceptId={concept?.id}
          currentLessonId={lesson.id}
          onNavigate={closeOnNavigate(setOutlineOpen)}
        />
      </SidePanel>

      <LessonReader
        topic={topic}
        concept={concept}
        lesson={lesson}
        position={position}
        prev={prev}
        next={next}
        outlineOpen={outlineOpen}
        intelOpen={intelOpen}
        onOpenOutline={() => setOutlineOpen(true)}
        onOpenIntel={() => setIntelOpen(true)}
      />

      <SidePanel
        open={intelOpen}
        onClose={() => setIntelOpen(false)}
        side="right"
        label="Topic intelligence"
        className="lg:w-[248px] xl:w-[288px]"
      >
        <div className="p-4 lg:p-0">
          {concept ? (
            <TopicIntelligence
              courseId={courseId}
              topicId={topicId}
              topic={topic}
              concept={conceptQuery.data ?? concept}
              onNavigate={closeOnNavigate(setIntelOpen)}
            />
          ) : (
            <Panel className="p-4 text-sm leading-relaxed text-muted">
              This lesson is not attached to a concept in this topic yet, so there is no
              intelligence to show.
            </Panel>
          )}
        </div>
      </SidePanel>
    </div>
  )
}
