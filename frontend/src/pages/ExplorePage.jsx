/**
 * ExplorePage — /explore, the course catalog.
 *
 * The catalog says what a course is; everything about the student is read from
 * the stores. The four tabs (all, enrolled, not enrolled, saved) come from the
 * enrollment and bookmark stores with real counts, and a card only shows
 * coverage or estimated mastery when the course is in My courses and there are
 * answers behind the figure. Nothing in the catalog data is invented any more.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../hooks/useCatalog'
import { usePracticeData } from '../hooks/usePracticeData.js'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useAuth } from '../context/AuthContext.jsx'
import { useProgress } from '../lib/masteryStore.js'
import { useEnrollments } from '../lib/enrollment.js'
import { toggleSaved, useSaved } from '../lib/saved.js'
import { courseStats } from '../lib/courseStats.js'
import { masteryLabel, statusFor, toneClass } from '../components/map/conceptStatus.js'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { StartPracticeButton } from '../components/practice/StartPracticeButton.jsx'
import {
  IconSearch,
  IconExplore,
  IconLearning,
  IconAnalytics,
  IconNotes,
  IconDashboard,
  IconInterview,
  IconSettings,
  IconTarget,
  IconBookmark,
} from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const COURSE_ICONS = {
  chip: IconAnalytics,
  nodes: IconExplore,
  database: IconNotes,
  globe: IconInterview,
  layers: IconDashboard,
  code: IconLearning,
  wrench: IconSettings,
  spark: IconTarget,
  server: IconExplore,
}

const CATEGORIES = ['All categories', 'Computer Science', 'Systems', 'Data', 'Architecture', 'Programming', 'AI']
const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'hardest', label: 'Hardest' },
]

const TAB_LABELS = {
  all: 'All',
  enrolled: 'Enrolled',
  not_enrolled: 'Not enrolled',
  saved: 'Saved',
}

const LEVEL_RANK = { Beginner: 1, Intermediate: 2, Advanced: 3 }

function CourseIcon({ name, className }) {
  const Icon = COURSE_ICONS[name] || IconExplore
  return <Icon size={20} className={className} />
}

function MasteryLine({ mastery }) {
  const status = statusFor(mastery?.value ?? null)
  const StatusIcon = status.icon
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
      <StatusIcon size={13} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
      {masteryLabel(mastery?.value ?? null)}
    </p>
  )
}

function CourseCard({ course, tree, enrolled, saved, stats, onOpen, onToggleSaved }) {
  const showNumbers = enrolled && stats && stats.answers > 0
  const coveragePct = stats?.coverage == null ? 0 : Math.round(stats.coverage * 100)

  return (
    <Panel
      className="flex cursor-pointer flex-col p-5 transition-colors hover:border-line-strong"
      onClick={() => onOpen(course.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(course.id)
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`Open ${course.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-tint text-primary">
          <CourseIcon name={course.icon} />
        </span>
        <div className="flex items-center gap-2">
          {enrolled && <Badge tone="primary" label="Enrolled" />}
          <button
            type="button"
            aria-pressed={Boolean(saved)}
            aria-label={saved ? `Remove ${course.title} from saved` : `Save ${course.title}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleSaved(course.id)
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-control border border-line text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              saved ? 'text-primary' : ''
            }`}
          >
            <IconBookmark size={15} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-ink">{course.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{course.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{course.level}</span>
        {tree && (
          <>
            <span aria-hidden="true">·</span>
            <span>{tree.topics.length} topics</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{course.hours}h</span>
      </div>

      {showNumbers ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Practice coverage</span>
            <span className="font-medium tabular-nums text-ink">
              {stats.practised} of {stats.concepts} concepts
            </span>
          </div>
          <ProgressLine className="mt-1.5" percentage={coveragePct} />
          <MasteryLine mastery={stats.mastery} />
        </div>
      ) : enrolled ? (
        <div className="mt-4 text-xs text-muted">No practice yet — nothing measured.</div>
      ) : (
        <div className="mt-4 text-xs text-muted">
          Prerequisites:{' '}
          <span className="text-ink">
            {course.prerequisites?.length ? course.prerequisites.join(', ') : 'None'}
          </span>
        </div>
      )}

      <div className="mt-4 pt-1" onClick={(event) => event.stopPropagation()}>
        {enrolled ? (
          <StartPracticeButton courseId={course.id} scope="course" label="Continue practice" fullWidth />
        ) : (
          <StartPracticeButton
            courseId={course.id}
            scope="course"
            label="Start practice"
            variant="secondary"
            enroll
            fullWidth
          />
        )}
      </div>
    </Panel>
  )
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-panel border border-line bg-surface p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-5/6" />
          <Skeleton className="mt-4 h-3 w-1/2" />
          <Skeleton className="mt-4 h-8 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function ExplorePage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { data: courses, isLoading, isError, error, refetch } = useCatalog()
  const enrollments = useEnrollments(userId)
  const savedState = useSaved(userId)
  const progress = useProgress(userId)

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'Explore' }])

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [sort, setSort] = useState('recommended')
  const [tab, setTab] = useState('all')

  const list = Array.isArray(courses) ? courses : []
  const { data: trees = [] } = usePracticeData(list.map((course) => course.id))
  const treeById = useMemo(
    () => Object.fromEntries(trees.map((tree) => [tree.id, tree])),
    [trees]
  )

  const enrolledIds = useMemo(() => new Set(Object.keys(enrollments.courses)), [enrollments])
  const savedIds = useMemo(() => new Set(savedState.courseIds), [savedState])

  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase()
    return list.filter((course) => {
      const matchesSearch =
        !query ||
        course.title.toLowerCase().includes(query) ||
        course.summary.toLowerCase().includes(query)
      const matchesCategory = category === CATEGORIES[0] || course.category === category
      return matchesSearch && matchesCategory
    })
  }, [list, search, category])

  const counts = useMemo(
    () => ({
      all: scoped.length,
      enrolled: scoped.filter((course) => enrolledIds.has(course.id)).length,
      not_enrolled: scoped.filter((course) => !enrolledIds.has(course.id)).length,
      saved: scoped.filter((course) => savedIds.has(course.id)).length,
    }),
    [scoped, enrolledIds, savedIds]
  )

  const results = useMemo(() => {
    const byTab = scoped.filter((course) => {
      if (tab === 'enrolled') return enrolledIds.has(course.id)
      if (tab === 'not_enrolled') return !enrolledIds.has(course.id)
      if (tab === 'saved') return savedIds.has(course.id)
      return true
    })

    const sorted = [...byTab]
    if (sort === 'shortest') {
      sorted.sort((a, b) => a.hours - b.hours)
    } else if (sort === 'hardest') {
      sorted.sort((a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0))
    } else {
      sorted.sort((a, b) => {
        const enrolledDelta = (enrolledIds.has(b.id) ? 1 : 0) - (enrolledIds.has(a.id) ? 1 : 0)
        if (enrolledDelta !== 0) return enrolledDelta
        return a.title.localeCompare(b.title)
      })
    }
    return sorted
  }, [scoped, tab, sort, enrolledIds, savedIds])

  const openCourse = (id) => navigate(`/course/${id}`)
  const hasActiveFilters = search.trim() !== '' || category !== CATEGORIES[0]

  const clearFilters = () => {
    setSearch('')
    setCategory(CATEGORIES[0])
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Course catalog</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
        Explore your next subject
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Pick a computer science course and start practicing. Every answer is scored, and study
        material is there when you want it.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Search courses"
            placeholder="Search courses…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:flex sm:items-center">
          <Select
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={CATEGORIES.map((value) => ({ value, label: value }))}
          />
          <Select
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            options={SORTS}
          />
        </div>
      </div>

      <Tabs
        className="mt-4 overflow-x-auto no-scrollbar"
        value={tab}
        onChange={setTab}
        tabs={Object.entries(TAB_LABELS).map(([value, label]) => ({
          value,
          label: `${label} ${counts[value]}`,
        }))}
      />

      <p className="mt-3 text-sm text-muted" role="status">
        {results.length} {results.length === 1 ? 'course' : 'courses'}
        {tab !== 'all' ? ` in ${TAB_LABELS[tab]}` : ''}
      </p>

      <div className="mt-4">
        {isLoading ? (
          <>
            <span role="status" className="sr-only">
              Loading courses…
            </span>
            <CardGridSkeleton />
          </>
        ) : isError ? (
          <ErrorState
            title="Could not load the catalog"
            message={error?.message || 'The course catalog is unavailable right now.'}
            onRetry={() => refetch()}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={IconSearch}
            title="No courses match"
            description={
              hasActiveFilters
                ? 'Try a different search term, or clear the filters to see the full catalog.'
                : 'Nothing here yet.'
            }
            {...(hasActiveFilters && {
              actionLabel: 'Clear filters',
              onAction: clearFilters,
            })}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {results.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                tree={treeById[course.id] ?? null}
                enrolled={enrolledIds.has(course.id)}
                saved={savedIds.has(course.id)}
                stats={courseStats(treeById[course.id] ?? null, progress)}
                onOpen={openCourse}
                onToggleSaved={(id) => toggleSaved(userId, id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
