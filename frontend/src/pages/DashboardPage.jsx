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
import { profileApi } from '../api/index.js'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    profileApi
      .getProfile(userId)
      .then((data) => {
        if (active) setProfile(data)
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
          onClick={() => navigate('/practice/new')}
        >
          Start practice
        </Button>
      </div>
    )
  }

  const breakdown = profile?.mastery_breakdown ?? []
  const topicAverages = selectPerTopicAverages(breakdown)
  const bloomAverages = selectPerBloomAverages(breakdown)

  const overallPct = Math.round((profile?.average_score ?? 0) * 100)
  const attemptCount = profile?.total_attempts ?? 0
  const weakAreaCount = topicAverages.filter((item) => item.average_score < 0.7).length

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Performance telemetry for ${user?.email || 'authenticated user'}.`}
        actions={
          <Button icon={<IconPlus size={16} />} onClick={() => navigate('/practice/new')}>
            Continue practice
          </Button>
        }
      />

      <div className="space-y-4">
        {/* Headline metrics */}
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

        {/* Mastery Breakdown: By Topic */}
        <PanelLarge>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Topic Mastery
          </h2>
          <div className="mt-3">
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Cognitive Depth (Bloom Taxonomy)
          </h2>
          <div className="mt-3">
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
  )
}
