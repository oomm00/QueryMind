/**
 * CoursePage — /course/:id
 *
 * The page behind a catalog card. QueryMind is an assessment platform, so the
 * page leads with practice: what the course covers, how much of it is measured,
 * and a topic list where each row starts practice, jumps to the topic's optional
 * study material, or opens its knowledge graph. The study-material panel below
 * the topics carries the anchors those rows jump to, one section per topic.
 *
 * Mastery is the estimate from scored practice answers (lib/mastery.js) and
 * study-notes review comes from the lessonProgress store; the catalog's own
 * completion and mastery figures are not used here, so nothing on this page is
 * invented — a topic with no scored answer says "No estimate".
 *
 * A catalog entry whose content has not been written yet, or an id that is not in
 * the catalog at all, says so instead of rendering an empty course.
 */

import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCatalog } from '../hooks/useCatalog'
import { useCourse } from '../hooks/useCourse'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useAuth } from '../context/AuthContext.jsx'
import { useLessonProgress } from '../content/lessonProgress.js'
import { rollUp } from '../lib/mastery.js'
import { useMastery } from '../lib/masteryStore.js'
import { practiceLink } from '../lib/practiceLink'
import { sentenceCase } from '../lib/text'
import { Button, buttonClasses } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PanelLarge } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { rollUpLine, statusFor, toneClass } from '../components/map/conceptStatus'
import { TopicStudyMaterial } from '../components/content/TopicStudyMaterial'
import { IconArrowRight, IconLearning, IconMap, IconSearch } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }
const EXPLORE_CRUMB = { label: 'Explore', to: '/explore' }

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function reviewedIn(lessonIds, completed) {
  return lessonIds.filter((lessonId) => completed[lessonId]).length
}

/** What a topic is judged by: what it covers, and what can be practised. */
function topicCounts(topic) {
  return {
    concepts: topic.conceptCount ?? 0,
    resources: topic.resourceCount ?? 0,
    questions: topic.questionCount ?? 0,
  }
}

function TopicRow({ courseId, topic, progress, estimatesById }) {
  const lessonIds = topic.lessonIds ?? []
  const counts = topicCounts(topic)
  // A topic rolls up over the concepts that have an estimate, and says how many.
  const topicMastery = rollUp(estimatesById, topic.conceptIds ?? [])
  const mastery = topicMastery?.value ?? null
  const status = statusFor(mastery)
  const StatusIcon = status.icon
  const reviewed = reviewedIn(lessonIds, progress.completed)
  const started = reviewed > 0 || topicMastery !== null
  const percent = lessonIds.length ? Math.round((reviewed / lessonIds.length) * 100) : 0

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{sentenceCase(topic.title)}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {plural(counts.concepts, 'concept')} · {plural(counts.resources, 'resource')} ·{' '}
            {plural(counts.questions, 'question')}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link to={practiceLink({ topic: topic.id })} className={buttonClasses({ size: 'sm' })}>
            {started ? 'Continue practice' : 'Start practice'}
          </Link>
          <a
            href={`#study-material-${topic.id}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Study material
          </a>
          <Link
            to={`/map/${courseId}/${topic.id}`}
            className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'px-2' })}
            aria-label={`Open the knowledge graph for ${sentenceCase(topic.title)}`}
            title="Knowledge graph"
          >
            <IconMap size={16} />
          </Link>
        </div>
      </div>

      {lessonIds.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Study notes reviewed</span>
            <span className="font-medium tabular-nums text-ink">
              {reviewed} of {lessonIds.length}
            </span>
          </div>
          <ProgressLine className="mt-1.5" percentage={percent} />
        </div>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <StatusIcon size={14} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
        {rollUpLine(topicMastery)}
      </p>
    </li>
  )
}

function CourseSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

export default function CoursePage() {
  const { id } = useParams()
  const { userId } = useAuth()
  const progress = useLessonProgress()
  const estimates = useMastery(userId)
  const { data: course, isLoading, isError, error, refetch } = useCourse(id)
  const { data: catalog, isLoading: catalogLoading } = useCatalog()

  const entry = Array.isArray(catalog) ? catalog.find((item) => item.id === id) ?? null : null
  const title = course?.title ?? entry?.title ?? sentenceCase(id)
  const summary = course?.summary || entry?.summary || ''

  useBreadcrumbs([WORKSPACE_CRUMB, EXPLORE_CRUMB, { label: title }])

  if (isLoading || catalogLoading) return <CourseSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <ErrorState
          className="w-full max-w-md"
          title="Could not load this course"
          message={error?.message || 'The course is unavailable right now.'}
        />
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const topics = course?.topics ?? []
  // The content course has its own id (the catalog uses its own slugs); links
  // follow the course so practice, the notes and the graph all land on content.
  const courseId = course?.id ?? id
  const lessonIds = topics.flatMap((topic) => topic.lessonIds ?? [])
  const reviewed = reviewedIn(lessonIds, progress.completed)
  const conceptIds = topics.flatMap((topic) => topic.conceptIds ?? [])
  const courseMastery = rollUp(estimates, conceptIds)
  const mastery = courseMastery?.value ?? null
  const status = statusFor(mastery)
  const StatusIcon = status.icon
  const completionPct = lessonIds.length ? Math.round((reviewed / lessonIds.length) * 100) : 0
  const resourceCount = topics.reduce((sum, topic) => sum + topicCounts(topic).resources, 0)
  const questionCount = topics.reduce((sum, topic) => sum + topicCounts(topic).questions, 0)

  // Practice starts where the course does: its first topic that has questions.
  const practiceTopic =
    topics.find((topic) => topicCounts(topic).questions > 0) ?? topics[0] ?? null
  const started = reviewed > 0 || courseMastery !== null
  const primary = practiceTopic
    ? {
        to: practiceLink({ topic: practiceTopic.id }),
        label: started ? 'Continue practice' : 'Start practice',
      }
    : null

  return (
    <div>
      <PageHeader
        title={title}
        description={summary || 'This course has no summary yet.'}
        actions={
          primary && (
            <Link to={primary.to} className={buttonClasses()}>
              <IconArrowRight size={16} />
              {primary.label}
            </Link>
          )
        }
      />

      {topics.length === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={entry ? IconSearch : IconLearning}
            title={entry ? 'No practice questions yet' : 'We could not find that course'}
            description={
              entry
                ? `${entry.title} is in the catalog, but none of its topics, questions or study material have been written yet. Its card will start working as soon as they are.`
                : 'The catalog has no course with this address. It may have been renamed, or the link may be out of date.'
            }
          />
          <div className="mt-4 flex justify-center">
            <Link
              to="/explore"
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              Back to Explore
            </Link>
          </div>
        </PanelLarge>
      ) : (
        <div className="space-y-4">
          <PanelLarge>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Your progress</h2>
                <p className="mt-0.5 text-xs text-muted">
                  From the study notes you have reviewed and the checks you have answered in this
                  session.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral" label={plural(topics.length, 'topic')} />
                <Badge tone="neutral" label={plural(questionCount, 'question')} />
                <Badge tone="neutral" label={plural(resourceCount, 'resource')} />
                <Badge tone="neutral" label={plural(lessonIds.length, 'study note')} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Study notes reviewed</span>
                <span className="font-medium tabular-nums text-ink">
                  {reviewed} of {lessonIds.length}
                </span>
              </div>
              <ProgressLine className="mt-1.5" percentage={completionPct} />
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <StatusIcon size={14} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
                {rollUpLine(courseMastery)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Mastery is estimated from the answers given in practice, one score per answered
                question. A topic or the course as a whole only covers the concepts that have been
                answered — reviewing a study note never changes any of it.
              </p>
            </div>
          </PanelLarge>

          <PanelLarge>
            <h2 className="text-sm font-semibold text-ink">Topics</h2>
            <p className="mt-0.5 text-xs text-muted">
              Each topic starts practice, or opens its study material and knowledge graph.
            </p>
            <ol className="mt-2 divide-y divide-line">
              {topics.map((topic) => (
                <TopicRow
                  key={topic.id}
                  courseId={courseId}
                  topic={topic}
                  progress={progress}
                  estimatesById={estimates}
                />
              ))}
            </ol>
          </PanelLarge>

          <PanelLarge>
            <h2 className="text-sm font-semibold text-ink">Study material</h2>
            <p className="mt-0.5 text-xs text-muted">
              Optional reading, topic by topic. Practising comes first — no question depends on it,
              and a topic with nothing here says so.
            </p>
            <div className="mt-3 divide-y divide-line">
              {topics.map((topic) => (
                <TopicStudyMaterial key={topic.id} courseId={courseId} topic={topic} />
              ))}
            </div>
          </PanelLarge>
        </div>
      )}
    </div>
  )
}
