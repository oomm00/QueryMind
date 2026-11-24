/**
 * WeakAreasPage — /weak-areas
 *
 * Requirements:
 * - Derived from mastery: lowest topics with >= 2 attempts and mastery < 70%.
 * - Each has a "Practice this" button that immediately starts a practice session.
 * - Clean empty state when no topics meet the threshold or no data exists.
 * - Pure real data from GET /mastery/me.
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
import { IconWeakAreas, IconTarget, IconArrowRight, IconPlus } from '../components/ui/Icons.jsx'
import { formatWhen } from '../lib/text.js'
import { holdDraft, newSession, saveSession } from '../lib/sessions.js'

export default function WeakAreasPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Weak Areas' }])

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  // Filter: topics with at least 2 attempts where mastery is under 70%
  const weakTopics = records
    .filter((r) => (r.attempts_count || 0) >= 2 && (r.mastery_score || 0) < 0.7)
    .sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0))

  const totalPracticed = records.length
  const totalAttempts = records.reduce((sum, r) => sum + (r.attempts_count || 0), 0)

  return (
    <div className="space-y-5" data-testid="weak-areas-page">
      <PageHeader
        title="Weak Areas"
        description="Topics with 2 or more attempts scoring under 70% mastery, ordered by need."
        actions={
          <Button icon={<IconPlus size={16} />} onClick={() => navigate('/practice')}>
            New practice
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Areas needing practice"
          value={weakTopics.length}
          hint="Score < 70% (min 2 attempts)"
          icon={IconWeakAreas}
          tone={weakTopics.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Total practiced topics"
          value={totalPracticed}
          hint="Across all subjects"
          icon={IconTarget}
          tone="primary"
        />
        <StatCard
          label="Total attempts evaluated"
          value={totalAttempts}
          hint="Questions answered"
          icon={IconTarget}
          tone="neutral"
        />
      </div>

      {/* Content */}
      {weakTopics.length === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={IconWeakAreas}
            title={totalPracticed === 0 ? 'No attempts recorded yet' : 'No weak areas identified'}
            description={
              totalPracticed === 0
                ? 'Complete practice sessions on any topic to track your performance and identify areas to improve.'
                : 'All topics with 2 or more attempts have reached 70% or higher mastery. Keep practicing to maintain your level.'
            }
            action={
              <Button onClick={() => navigate('/practice')} icon={<IconPlus size={16} />}>
                Practice a topic
              </Button>
            }
          />
        </PanelLarge>
      ) : (
        <div className="space-y-3.5" data-testid="weak-areas-list">
          {weakTopics.map((item) => {
            const pct = Math.round((item.mastery_score || 0) * 100)
            const isSevere = pct < 50
            return (
              <Panel
                key={item.topic}
                className="p-5 transition-all duration-200 hover:border-line-strong hover:shadow-md space-y-4"
                data-testid={`weak-topic-${item.topic}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-semibold text-ink">{item.topic}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isSevere
                          ? 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
                          : 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                      }`}>
                        {isSevere ? 'Priority Need' : 'Moderate Need'}
                      </span>
                      {item.subject && <Badge variant="neutral" label={item.subject} />}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {item.attempts_count} attempt{item.attempts_count !== 1 ? 's' : ''} evaluated • Last practiced:{' '}
                      {item.last_updated ? formatWhen(item.last_updated) : 'Recently'}
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={<IconArrowRight size={14} />}
                    onClick={() => startTopicPractice(item.topic, item.subject)}
                    className="shadow-sm"
                  >
                    Practice this
                  </Button>
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted font-medium">Mastery score (target: 70%)</span>
                    <span className="font-bold text-danger tabular-nums text-sm">{pct}%</span>
                  </div>
                  <ProgressLine percentage={pct} tone="danger" />
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
