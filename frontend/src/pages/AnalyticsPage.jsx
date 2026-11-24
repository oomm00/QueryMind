/**
 * AnalyticsPage — /analytics
 *
 * Requirements:
 * - Built from the user's real attempts from GET /attempts/history/{user_id}.
 * - Score over time (SVG trendline/points).
 * - Level history (Bloom level progression).
 * - Attempts per day (daily activity distribution).
 * - Average per topic (topic breakdown).
 * - Real charts, empty state with clear message when there is no data.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { StatCard } from '../components/ui/StatCard.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ProgressLine } from '../components/ui/ProgressLine.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { IconAnalytics, IconTarget, IconClock, IconLearning, IconPlus } from '../components/ui/Icons.jsx'
import { getBloomColor } from '../constants/bloomTaxonomy.js'

const BLOOM_RANK = {
  remember: 1,
  understand: 2,
  apply: 3,
  analyze: 4,
  evaluate: 5,
  create: 6,
}

function scoreTone(pct) {
  if (pct >= 70) return 'success'
  if (pct >= 40) return 'warning'
  return 'danger'
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Analytics' }])

  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    attemptsApi
      .getHistory(userId)
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : data?.attempts ?? []
          setHistory(list)
        }
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load attempt analytics')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  // Process data chronologically (oldest to newest)
  const chronological = useMemo(() => {
    return [...history].reverse()
  }, [history])

  // Group by day
  const dailyCounts = useMemo(() => {
    const map = new Map()
    for (const item of chronological) {
      const stamp = item.submitted_at || item.created_at
      const day = stamp ? stamp.slice(0, 10) : 'Today'
      map.set(day, (map.get(day) || 0) + 1)
    }
    return Array.from(map.entries()).map(([day, count]) => ({ day, count }))
  }, [chronological])

  // Topic averages
  const topicStats = useMemo(() => {
    const map = new Map()
    for (const item of history) {
      const topic = item.topic || 'General'
      const cur = map.get(topic) || { totalScore: 0, count: 0 }
      cur.totalScore += Number(item.score) || 0
      cur.count += 1
      map.set(topic, cur)
    }
    return Array.from(map.entries())
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        avgScore: Math.round((data.totalScore / data.count) * 100),
      }))
      .sort((a, b) => b.count - a.count)
  }, [history])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const totalAttempts = history.length
  const avgScore =
    totalAttempts > 0
      ? Math.round(
          (history.reduce((sum, h) => sum + (Number(h.score) || 0), 0) / totalAttempts) * 100
        )
      : 0
  const highestRung = history.reduce((max, h) => {
    const rank = BLOOM_RANK[h.bloom_level?.toLowerCase()] || 0
    return rank > max ? rank : max
  }, 0)
  const highestLevelName =
    Object.keys(BLOOM_RANK).find((k) => BLOOM_RANK[k] === highestRung) || 'None'

  return (
    <div className="space-y-5" data-testid="analytics-page">
      <PageHeader
        title="Learning Analytics"
        description="Performance trends, cognitive level progression, and question history telemetry."
        actions={
          <Button icon={<IconPlus size={16} />} onClick={() => navigate('/practice')}>
            Start practice
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total attempts"
          value={totalAttempts}
          hint="Questions evaluated"
          icon={IconClock}
          tone="neutral"
        />
        <StatCard
          label="Average score"
          value={`${avgScore}%`}
          hint="Across all attempts"
          icon={IconTarget}
          tone={scoreTone(avgScore)}
        />
        <StatCard
          label="Highest level reached"
          value={capitalize(highestLevelName)}
          hint="Cognitive ceiling"
          icon={IconAnalytics}
          tone="primary"
        />
        <StatCard
          label="Topics explored"
          value={topicStats.length}
          hint="Active subjects"
          icon={IconLearning}
          tone="primary"
        />
      </div>

      {totalAttempts === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={IconAnalytics}
            title="No analytics data yet"
            description="Complete practice sessions to see your score trajectory, level progression, and daily practice volume."
            action={
              <Button onClick={() => navigate('/practice')} icon={<IconPlus size={16} />}>
                Start practice
              </Button>
            }
          />
        </PanelLarge>
      ) : (
        <div className="space-y-5">
          {/* Score Over Time SVG Chart */}
          <PanelLarge>
            <h2 className="text-sm font-semibold text-ink">Score Over Time</h2>
            <p className="mt-0.5 text-xs text-muted">
              Evaluation score percentage across your last {chronological.length} attempts.
            </p>

            <div className="mt-4">
              <div className="relative h-48 w-full">
                <svg
                  className="h-full w-full overflow-visible"
                  viewBox={`0 0 ${Math.max(100, (chronological.length - 1) * 60 + 40)} 100`}
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  <line x1="0" y1="20" x2="100%" y2="20" stroke="currentColor" className="text-line" strokeDasharray="2,2" />
                  <line x1="0" y1="50" x2="100%" y2="50" stroke="currentColor" className="text-line" strokeDasharray="2,2" />
                  <line x1="0" y1="80" x2="100%" y2="80" stroke="currentColor" className="text-line" strokeDasharray="2,2" />

                  {/* SVG line */}
                  {chronological.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={chronological
                        .map((item, idx) => {
                          const x = idx * 60 + 20
                          const y = 90 - (Number(item.score) || 0) * 80
                          return `${x},${y}`
                        })
                        .join(' ')}
                    />
                  )}

                  {/* Data points */}
                  {chronological.map((item, idx) => {
                    const x = chronological.length === 1 ? 50 : idx * 60 + 20
                    const score = Number(item.score) || 0
                    const y = 90 - score * 80
                    return (
                      <g key={item.attempt_id || idx}>
                        <circle
                          cx={x}
                          cy={y}
                          r="4"
                          className={score >= 0.7 ? 'fill-emerald-400' : score >= 0.4 ? 'fill-amber-400' : 'fill-rose-400'}
                          stroke="#18181b"
                          strokeWidth="1.5"
                        />
                        <text
                          x={x}
                          y={y - 7}
                          textAnchor="middle"
                          fontSize="9"
                          className="fill-muted font-mono"
                        >
                          {Math.round(score * 100)}%
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted">
                <span>Attempt #1</span>
                <span>Attempt #{chronological.length}</span>
              </div>
            </div>
          </PanelLarge>

          {/* Level Progression & Daily Volume Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Level History */}
            <PanelLarge>
              <h2 className="text-sm font-semibold text-ink">Cognitive Level Progression</h2>
              <p className="mt-0.5 text-xs text-muted">
                Bloom taxonomy rung requested for each question.
              </p>

              <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
                {chronological.map((item, idx) => {
                  const bloom = item.bloom_level || 'remember'
                  const color = getBloomColor(bloom)
                  return (
                    <div
                      key={item.attempt_id || idx}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-line last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted w-6">#{idx + 1}</span>
                        <span className="font-medium text-ink">{item.topic}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {capitalize(bloom)}
                        </span>
                        <span className="font-mono text-muted tabular-nums">
                          {Math.round((Number(item.score) || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </PanelLarge>

            {/* Daily Practice Volume */}
            <PanelLarge>
              <h2 className="text-sm font-semibold text-ink">Daily Activity Volume</h2>
              <p className="mt-0.5 text-xs text-muted">Attempts submitted per calendar day.</p>

              <div className="mt-4 space-y-2">
                {dailyCounts.map(({ day, count }) => {
                  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1)
                  const barPct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={day} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted font-mono">{day}</span>
                        <span className="font-semibold text-ink tabular-nums">
                          {count} question{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-surface-raised overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </PanelLarge>
          </div>

          {/* Average per Topic */}
          <PanelLarge>
            <h2 className="text-sm font-semibold text-ink">Topic Performance Breakdown</h2>
            <p className="mt-0.5 text-xs text-muted">Average score and attempts by topic.</p>

            <div className="mt-4 space-y-3">
              {topicStats.map((item) => (
                <div key={item.topic} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{item.topic}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted">
                        {item.count} attempt{item.count !== 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold tabular-nums text-ink">{item.avgScore}%</span>
                    </div>
                  </div>
                  <ProgressLine percentage={item.avgScore} tone={scoreTone(item.avgScore)} />
                </div>
              ))}
            </div>
          </PanelLarge>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
