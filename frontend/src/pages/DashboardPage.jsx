/**
 * DashboardPage — /dashboard
 * Mastery Dashboard displaying cognitive knowledge profiles.
 * Uses selectors to aggregate mastery_breakdown rows into:
 *  1. Per-topic averages
 *  2. Per-Bloom-level averages
 * Eliminates nil-UUID fallback and uses AuthContext.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi, masteryApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { selectPerTopicAverages, selectPerBloomAverages } from '../api/adapter.js'
import { getBloomColor } from '../constants/bloomTaxonomy.js'
import { Button } from '../components/ui/Button'
import { PanelLarge } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { MetricBar } from '../components/ui/MetricBar'
import { ProgressLine } from '../components/ui/ProgressLine'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import {
  IconTarget,
  IconLearning,
  IconClock,
  IconWeakAreas,
  IconAnalytics,
  IconPlus,
} from '../components/ui/Icons'

function scoreTone(pct) {
  if (pct >= 70) return 'success'
  if (pct >= 40) return 'warning'
  return 'danger'
}

function labelize(value) {
  const text = String(value ?? '')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { userId, user } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Dashboard' }])
  const [profile, setProfile] = useState(null)
  const [masteryRecords, setMasteryRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    Promise.all([
      profileApi.getProfile(userId).catch(() => null),
      masteryApi.getMyMastery().catch(() => []),
    ])
      .then(([prof, recs]) => {
        if (active) {
          setProfile(prof)
          setMasteryRecords(Array.isArray(recs) ? recs : [])
        }
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load profile')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  if (loading) {
    return (
      <div>
        <div role="status" className="sr-only">
          Loading dashboard…
        </div>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="mt-4 space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <ErrorState
          className="w-full max-w-md"
          title="Could not load your mastery profile"
          message={error}
        />
        <Button
          variant="secondary"
          icon={<IconPlus size={16} />}
          onClick={() => navigate('/practice')}
        >
          Start practice
        </Button>
      </div>
    )
  }

  const breakdown = profile?.mastery_breakdown ?? []
  const topicAverages = masteryRecords.length > 0
    ? masteryRecords.map((r) => ({
        topic: r.topic,
        subject: r.subject,
        average_score: r.mastery_score ?? 0,
        total_attempts: r.attempts_count ?? 0,
      }))
    : selectPerTopicAverages(breakdown)
  const bloomAverages = selectPerBloomAverages(breakdown)

  const overallPct = masteryRecords.length > 0
    ? Math.round(
        (masteryRecords.reduce((sum, r) => sum + (r.mastery_score ?? 0), 0) / masteryRecords.length) * 100
      )
    : Math.round((profile?.average_score ?? 0) * 100)

  const attemptCount = masteryRecords.length > 0
    ? masteryRecords.reduce((sum, r) => sum + (r.attempts_count ?? 0), 0)
    : (profile?.total_attempts ?? 0)

  const weakAreaCount = masteryRecords.length > 0
    ? masteryRecords.filter((r) => (r.attempts_count || 0) >= 2 && (r.mastery_score || 0) < 0.7).length
    : topicAverages.filter((item) => item.average_score < 0.7).length

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Bento Hero */}
      <div className="rounded-2xl border border-line bg-gradient-to-r from-surface/95 via-surface/80 to-surface-2/90 p-5 md:p-6 backdrop-blur-md shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#FF5C00] to-[#FF8033] text-lg font-bold text-white shadow-[0_0_15px_rgba(255,92,0,0.35)] ring-1 ring-white/20">
              {(user?.email || 'Q')[0].toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-ink">
                  Welcome back, {user?.name || user?.full_name || (user?.email ? user.email.split('@')[0] : 'Learner')}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="mt-0.5 text-xs md:text-sm text-muted">
                Adaptive cognitive engine ready • {user?.email || 'Telemetry active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              icon={<IconAnalytics size={14} />}
              onClick={() => navigate('/analytics')}
            >
              Analytics
            </Button>
            {weakAreaCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={<IconWeakAreas size={14} />}
                onClick={() => navigate('/weak-areas')}
              >
                Weak Areas ({weakAreaCount})
              </Button>
            )}
            <Button
              size="sm"
              icon={<IconPlus size={15} />}
              onClick={() => navigate('/practice')}
            >
              Start Practice
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Headline metrics Bento row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Overall mastery"
            value={`${overallPct}%`}
            hint="Average score"
            icon={IconTarget}
            tone={scoreTone(overallPct)}
          />
          <StatCard
            label="Topics tracked"
            value={topicAverages.length}
            hint="In this profile"
            icon={IconLearning}
            tone="primary"
          />
          <StatCard
            label="Total attempts"
            value={attemptCount}
            hint="Questions answered"
            icon={IconClock}
            tone="neutral"
          />
          <StatCard
            label="Weak areas"
            value={weakAreaCount}
            hint="Topics below 70%"
            icon={IconWeakAreas}
            tone={weakAreaCount > 0 ? 'danger' : 'success'}
          />
        </div>

        {/* Overall mastery progress */}
        <PanelLarge>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Mastery progress</h2>
              <p className="mt-0.5 text-xs text-muted">
                Your average across every recorded attempt.
              </p>
            </div>
            <span className="text-xl font-semibold tabular-nums text-ink">{overallPct}%</span>
          </div>
          <ProgressLine className="mt-3" percentage={overallPct} tone={scoreTone(overallPct)} />
        </PanelLarge>

        {/* 2-Column Split: Topic Mastery & Cognitive Depth */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Mastery Breakdown: By Topic */}
          <PanelLarge>
            <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Topic Mastery
              </h2>
              <span className="text-[11px] text-muted">{topicAverages.length} topics</span>
            </div>
            <div>
              {topicAverages.length === 0 ? (
                <EmptyState
                  icon={IconLearning}
                  title="No topic data yet"
                  description="Complete a study session to populate your mastery breakdown."
                />
              ) : (
                <div className="space-y-1">
                  {topicAverages.map((item) => (
                    <MetricBar
                      key={item.topic}
                      label={item.topic}
                      subtitle={`${item.total_attempts} attempt${
                        item.total_attempts !== 1 ? 's' : ''
                      }`}
                      score={item.average_score}
                    />
                  ))}
                </div>
              )}
            </div>
          </PanelLarge>

          {/* Mastery Breakdown: By Bloom's Taxonomy Level */}
          <PanelLarge>
            <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Cognitive Depth (Bloom Taxonomy)
              </h2>
              <span className="text-[11px] text-muted">6 Cognitive Levels</span>
            </div>
            <div>
              {bloomAverages.length === 0 ? (
                <EmptyState
                  icon={IconAnalytics}
                  title="No Bloom data yet"
                  description="Complete study sessions to see cognitive level progress."
                />
              ) : (
                <div className="space-y-1">
                  {bloomAverages.map((item) => (
                    <MetricBar
                      key={item.bloom_level}
                      label={labelize(item.bloom_level)}
                      subtitle={`${item.total_attempts} question${
                        item.total_attempts !== 1 ? 's' : ''
                      }`}
                      score={item.average_score}
                      color={getBloomColor(item.bloom_level)}
                    />
                  ))}
                </div>
              )}
            </div>
          </PanelLarge>
        </div>
      </div>
    </div>
  )
}
