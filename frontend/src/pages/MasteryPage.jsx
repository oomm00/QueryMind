/**
 * MasteryPage — /mastery
 * Displays real-time learner mastery per topic from GET /mastery/me.
 *
 * Requirements:
 * - Reads /mastery/me.
 * - Per topic shows mastery %, attempts, current level (rung), last practiced.
 * - Changes visibly after answering questions.
 * - Clean empty state when no data exists.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { masteryApi } from '../api/index.js'
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
import { IconTarget, IconLearning, IconClock, IconPlus, IconArrowRight } from '../components/ui/Icons.jsx'
import { formatWhen } from '../lib/text.js'
import { holdDraft, newSession, saveSession } from '../lib/sessions.js'

const BLOOM_RUNGS = [
  { bloom: 'remember', difficulty: 'easy', label: 'Remember / Easy' },
  { bloom: 'understand', difficulty: 'easy', label: 'Understand / Easy' },
  { bloom: 'apply', difficulty: 'medium', label: 'Apply / Medium' },
  { bloom: 'analyze', difficulty: 'medium', label: 'Analyze / Medium' },
  { bloom: 'evaluate', difficulty: 'hard', label: 'Evaluate / Hard' },
  { bloom: 'create', difficulty: 'hard', label: 'Create / Hard' },
]

function getRungLabel(bloomBreakdown = {}) {
  const levels = Object.keys(bloomBreakdown)
  if (levels.length === 0) return 'Remember / Easy'
  
  // Find the highest bloom level present in the breakdown
  for (let i = BLOOM_RUNGS.length - 1; i >= 0; i--) {
    if (bloomBreakdown[BLOOM_RUNGS[i].bloom] !== undefined) {
      return BLOOM_RUNGS[i].label
    }
  }
  return 'Remember / Easy'
}

function scoreTone(pct) {
  if (pct >= 70) return 'success'
  if (pct >= 40) return 'warning'
  return 'danger'
}

export default function MasteryPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Mastery' }])

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    masteryApi
      .getMyMastery()
      .then((data) => {
        if (active) setRecords(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load mastery records')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  const startTopicPractice = (topicName, subject) => {
    const session = newSession({
      scope: 'adaptive',
      subject: subject || null,
      topic: topicName,
      label: topicName,
      uploadedOnly: false,
      adaptive: true,
      questions: [],
    })
    saveSession(userId, session)
    holdDraft(session)
    navigate(`/practice/${session.id}`)
  }

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

  const totalTopics = records.length
  const totalAttempts = records.reduce((sum, r) => sum + (r.attempts_count || 0), 0)
  const avgMastery =
    totalTopics > 0
      ? Math.round((records.reduce((sum, r) => sum + (r.mastery_score || 0), 0) / totalTopics) * 100)
      : 0
  const masteredCount = records.filter((r) => (r.mastery_score || 0) >= 0.75).length

  return (
    <div className="space-y-5" data-testid="mastery-page">
      <PageHeader
        title="Topic Mastery"
        description="Live mastery telemetry updated after every evaluated practice attempt."
        actions={
          <Button icon={<IconPlus size={16} />} onClick={() => navigate('/practice')}>
            New practice
          </Button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Tracked topics"
          value={totalTopics}
          hint="Topics practiced"
          icon={IconLearning}
          tone="primary"
        />
        <StatCard
          label="Average mastery"
          value={`${avgMastery}%`}
          hint="Across all topics"
          icon={IconTarget}
          tone={scoreTone(avgMastery)}
        />
        <StatCard
          label="Total attempts"
          value={totalAttempts}
          hint="Questions answered"
          icon={IconClock}
          tone="neutral"
        />
        <StatCard
          label="Mastered (≥75%)"
          value={masteredCount}
          hint="Strong proficiency"
          icon={IconTarget}
          tone="success"
        />
      </div>

      {/* Main topic breakdown */}
      {records.length === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={IconLearning}
            title="No mastery records yet"
            description="Complete an adaptive practice session to start building your real-time mastery profile."
            action={
              <Button onClick={() => navigate('/practice')} icon={<IconPlus size={16} />}>
                Start practice
              </Button>
            }
          />
        </PanelLarge>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="mastery-records-list">
          {records.map((record) => {
            const pct = Math.round((record.mastery_score || 0) * 100)
            const rungLabel = getRungLabel(record.bloom_breakdown)
            const lastPracticed = record.last_updated ? formatWhen(record.last_updated) : 'Recently'

            return (
              <Panel
                key={`${record.subject || 'sub'}-${record.topic}`}
                className="p-5 transition-all duration-200 hover:border-line-strong hover:shadow-md flex flex-col justify-between gap-4"
                data-testid={`mastery-row-${record.subject || 'sub'}-${record.topic}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${pct >= 70 ? 'bg-emerald-400' : 'bg-[#FF5C00]'}`} />
                        <h3 className="text-base font-semibold text-ink truncate">{record.topic}</h3>
                      </div>
                      {record.subject && (
                        <p className="mt-0.5 text-xs font-medium text-muted">{record.subject}</p>
                      )}
                    </div>
                    <Badge variant="primary" label={`Level: ${rungLabel}`} />
                  </div>

                  <p className="mt-2 text-xs text-muted flex items-center gap-2">
                    <span>{record.attempts_count} attempt{record.attempts_count !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Last practiced: {lastPracticed}</span>
                  </p>
                </div>

                <div className="pt-2 border-t border-line/60">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted font-medium">Mastery accuracy</span>
                    <span className="font-bold text-ink tabular-nums text-sm">{pct}%</span>
                  </div>
                  <ProgressLine percentage={pct} tone={scoreTone(pct)} />

                  <div className="mt-3.5 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IconArrowRight size={14} />}
                      onClick={() => startTopicPractice(record.topic, record.subject)}
                      className="hover:border-primary/50 hover:text-primary"
                    >
                      Practice
                    </Button>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
