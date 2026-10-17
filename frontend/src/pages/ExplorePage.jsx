/**
 * ExplorePage — /explore
 * The computer science course catalog (Figma frame "Explore — computer
 * science catalog").
 *
 * Search, category, difficulty, status tabs and sort all really filter the list
 * served by useCatalog. Enrolled courses show progress and a Continue action;
 * the rest show a Start action. Every card links to /course/:id.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../hooks/useCatalog'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { Panel } from '../components/ui/Panel'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
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
  IconArrowRight,
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
const DIFFICULTIES = ['All difficulties', 'Beginner', 'Intermediate', 'Advanced']
const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'hardest', label: 'Hardest' },
]

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'not_started', label: 'Not started' },
  { value: 'saved', label: 'Saved' },
]

const LEVEL_RANK = { Beginner: 1, Intermediate: 2, Advanced: 3 }

function CourseIcon({ name, className }) {
  const Icon = COURSE_ICONS[name] || IconExplore
  return <Icon size={20} className={className} />
}

function CourseCard({ course, onOpen }) {
  const enrolled = course.status === 'enrolled'
  const completionPct = Math.round((course.completion ?? 0) * 100)
  const masteryPct = Math.round((course.estimatedMastery ?? 0) * 100)

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
        {enrolled ? (
          <Badge tone="primary" label="Enrolled" />
        ) : (
          <Badge tone="neutral" label="Not started" />
        )}
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-ink">{course.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{course.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{course.level}</span>
        <span aria-hidden="true">·</span>
        <span>{course.topicCount} topics</span>
        <span aria-hidden="true">·</span>
        <span>{course.hours}h</span>
      </div>

      {enrolled ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Completion</span>
            <span className="font-medium tabular-nums text-ink">{completionPct}%</span>
          </div>
          <ProgressLine className="mt-1.5" percentage={completionPct} />
          <p className="mt-2 text-xs text-muted">
            Estimated mastery{' '}
            <span className="font-medium tabular-nums text-ink">{masteryPct}%</span>
          </p>
        </div>
      ) : (
        <div className="mt-4 text-xs text-muted">
          Prerequisites:{' '}
          <span className="text-ink">
            {course.prerequisites?.length ? course.prerequisites.join(', ') : 'None'}
          </span>
        </div>
      )}

      <div className="mt-4 pt-1">
        {enrolled ? (
          <Button
            fullWidth
            icon={<IconArrowRight size={16} />}
            onClick={(event) => {
              event.stopPropagation()
              onOpen(course.id)
            }}
          >
            Continue practice
          </Button>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            onClick={(event) => {
              event.stopPropagation()
              onOpen(course.id)
            }}
          >
            Start practice
          </Button>
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
  const { data: courses, isLoading, isError, error, refetch } = useCatalog()

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'Explore' }])

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0])
  const [sort, setSort] = useState('recommended')
  const [tab, setTab] = useState('all')

  const list = Array.isArray(courses) ? courses : []

  // Tab counts reflect the current search/category/difficulty filters.
  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase()
    return list.filter((course) => {
      const matchesSearch =
        !query ||
        course.title.toLowerCase().includes(query) ||
        course.summary.toLowerCase().includes(query)
      const matchesCategory = category === CATEGORIES[0] || course.category === category
      const matchesDifficulty = difficulty === DIFFICULTIES[0] || course.level === difficulty
      return matchesSearch && matchesCategory && matchesDifficulty
    })
  }, [list, search, category, difficulty])

  const counts = useMemo(
    () => ({
      all: scoped.length,
      enrolled: scoped.filter((course) => course.status === 'enrolled').length,
      not_started: scoped.filter((course) => course.status === 'not_started').length,
      saved: scoped.filter((course) => course.saved).length,
    }),
    [scoped]
  )

  const results = useMemo(() => {
    const byTab = scoped.filter((course) => {
      if (tab === 'enrolled') return course.status === 'enrolled'
      if (tab === 'not_started') return course.status === 'not_started'
      if (tab === 'saved') return course.saved
      return true
    })

    const sorted = [...byTab]
    if (sort === 'shortest') {
      sorted.sort((a, b) => a.hours - b.hours)
    } else if (sort === 'hardest') {
      sorted.sort((a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0))
    } else {
      // Recommended: enrolled first, then by estimated mastery, then title.
      sorted.sort((a, b) => {
        const enrolledDelta = (b.status === 'enrolled') - (a.status === 'enrolled')
        if (enrolledDelta !== 0) return enrolledDelta
        const masteryDelta = (b.estimatedMastery ?? 0) - (a.estimatedMastery ?? 0)
        if (masteryDelta !== 0) return masteryDelta
        return a.title.localeCompare(b.title)
      })
    }
    return sorted
  }, [scoped, tab, sort])

  const openCourse = (id) => navigate(`/course/${id}`)

  const hasActiveFilters =
    search.trim() !== '' || category !== CATEGORIES[0] || difficulty !== DIFFICULTIES[0]

  const clearFilters = () => {
    setSearch('')
    setCategory(CATEGORIES[0])
    setDifficulty(DIFFICULTIES[0])
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Course catalog
      </p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
        Explore your next subject
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Pick a computer science course and start practising. Every answer is scored, and study
        material is there when you want it.
      </p>

      {/* ── Search + filters ─────────────────────────────── */}
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
            aria-label="Difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            options={DIFFICULTIES.map((value) => ({ value, label: value }))}
          />
          <Select
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            options={SORTS}
          />
        </div>
      </div>

      {/* ── Status tabs with live counts ─────────────────── */}
      <Tabs
        className="mt-4 overflow-x-auto no-scrollbar"
        value={tab}
        onChange={setTab}
        tabs={TABS.map((item) => ({
          value: item.value,
          label: `${item.label} ${counts[item.value]}`,
        }))}
      />

      <p className="mt-3 text-sm text-muted" role="status">
        {results.length} {results.length === 1 ? 'course' : 'courses'}
        {tab !== 'all' ? ` in ${TABS.find((item) => item.value === tab)?.label}` : ''}
      </p>

      {/* ── Results ──────────────────────────────────────── */}
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
                : 'Once courses are added they will appear here.'
            }
            {...(hasActiveFilters && {
              actionLabel: 'Clear filters',
              onAction: clearFilters,
            })}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {results.map((course) => (
              <CourseCard key={course.id} course={course} onOpen={openCourse} />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom banner ────────────────────────────────── */}
      <Panel className="mt-8 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold text-ink">Not sure what to practise first?</h2>
          <p className="mt-0.5 text-sm text-muted">
            Tell us what you are preparing for and we will put a practice plan together.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<IconArrowRight size={16} />}
          onClick={() => {
            /* stub — practice plan builder ships later */
          }}
        >
          Create a practice plan
        </Button>
      </Panel>
    </div>
  )
}
