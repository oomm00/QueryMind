/**
 * AnalyticsPage — /analytics
 * Comprehensive mastery and learning trajectory analytics.
 */

import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useMastery, useProgress } from '../lib/masteryStore'
import { useSessions } from '../lib/sessions'
import { scoreSession } from '../lib/marks'
import { resolveQuestions } from '../content/practiceBank'
import { BLOOM_COLORS, BLOOM_LEVELS } from '../constants/bloomTaxonomy'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, PanelLarge } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { MetricBar } from '../components/ui/MetricBar'
import { EmptyState } from '../components/ui/EmptyState'
import { buttonClasses } from '../components/ui/Button'
import { IconAnalytics, IconClock, IconTarget, IconPlus } from '../components/ui/Icons'

function percent(val) {
  if (val == null || !Number.isFinite(val)) return '—'
  return `${Math.round(val * 100)}%`
}

export default function AnalyticsPage() {
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Analytics' }])

  const estimates = useMastery(userId)
  const progress = useProgress(userId)
  const sessions = useSessions(userId)

  const concepts = useMemo(() => progress?.concepts ?? {}, [progress])
  const conceptKeys = Object.keys(concepts)

  // Overall average mastery
  const overallMastery = useMemo(() => {
    const values = Object.values(estimates).filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (values.length === 0) return null
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }, [estimates])

  // Total questions answered across all sessions
  const totalAnswered = useMemo(() => {
    return sessions.reduce((acc, s) => acc + Object.keys(s.answers ?? {}).length, 0)
  }, [sessions])

  // Aggregate Bloom breakdown
  const bloomStats = useMemo(() => {
    const buckets = {}
    for (const lvl of BLOOM_LEVELS) {
      buckets[lvl.value] = { count: 0, sum: 0 }
    }

    for (const record of Object.values(concepts)) {
      const byBloom = record.byBloom ?? {}
      for (const [bloom, stat] of Object.entries(byBloom)) {
        if (buckets[bloom] && stat?.estimate != null) {
          buckets[bloom].count += stat.attempts ?? 1
          buckets[bloom].sum += stat.estimate
        }
      }
    }

    return BLOOM_LEVELS.map((lvl) => {
      const b = buckets[lvl.value]
      const avg = b && b.count > 0 ? b.sum / b.count : null
      return {
        key: lvl.value,
        label: lvl.label,
        avg,
        attempts: b?.count ?? 0,
        color: BLOOM_COLORS[lvl.value],
      }
    })
  }, [concepts])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics & Telemetry"
        description="Detailed breakdown of your cognitive performance, accuracy, and study history."
        actions={
          <Link to="/practice" className={buttonClasses({ variant: 'primary' })}>
            <IconPlus size={16} />
            Start practice
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Overall Mastery"
          value={overallMastery != null ? percent(overallMastery) : 'No estimate'}
          hint="Calculated across concepts"
          icon={IconTarget}
          tone={overallMastery != null && overallMastery >= 0.7 ? 'success' : 'primary'}
        />
        <StatCard
          label="Tracked Concepts"
          value={conceptKeys.length}
          hint="Active mastery models"
          icon={IconAnalytics}
          tone="primary"
        />
        <StatCard
          label="Total Questions"
          value={totalAnswered}
          hint="Answered across all sessions"
          icon={IconClock}
          tone="neutral"
        />
        <StatCard
          label="Total Sessions"
          value={sessions.length}
          hint="Practice runs recorded"
          icon={IconTarget}
          tone="neutral"
        />
      </div>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Cognitive Depth Breakdown (Bloom's Taxonomy)</h2>
        <p className="mt-0.5 text-xs text-muted">
          Distribution of answers and performance by cognitive demand level.
        </p>

        <div className="mt-4 space-y-2">
          {bloomStats.map((item) => (
            <MetricBar
              key={item.key}
              label={item.label}
              subtitle={`${item.attempts} question${item.attempts === 1 ? '' : 's'} recorded`}
              score={item.avg ?? 0}
              color={item.color}
            />
          ))}
        </div>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Recent Session Trajectory</h2>
        <p className="mt-0.5 text-xs text-muted">
          Your last completed practice runs and their achieved accuracy.
        </p>

        {sessions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={IconClock}
              title="No session history yet"
              description="Complete a practice session to see performance trajectory over time."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {sessions.slice(0, 10).map((session) => {
              const questions = resolveQuestions(session.questionIds ?? [], session.questions ?? [])
              const score = scoreSession(questions, session.answers ?? {}, session.selfMarks ?? {})
              return (
                <li key={session.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{session.label || 'Practice Session'}</p>
                    <p className="text-xs text-muted">
                      {questions.length} questions · {Object.keys(session.answers ?? {}).length} answered
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {score.percent != null ? percent(score.percent) : 'Unscored'}
                    </span>
                    <p className="text-xs text-muted">
                      {score.earned} / {score.available} marks
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </PanelLarge>
    </div>
  )
}
