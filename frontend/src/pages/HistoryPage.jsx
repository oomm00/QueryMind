/**
 * HistoryPage — /history
 *
 * Requirements:
 * - Past sessions from real attempts from GET /attempts/history/{user_id}.
 * - Grouped by date and topic.
 * - Displays score per attempt, bloom level, difficulty, and session aggregate.
 * - Clean empty state when no history exists.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ProgressRing } from '../components/ui/ProgressRing.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { IconClock, IconPlus, IconArrowRight, IconTarget } from '../components/ui/Icons.jsx'
import { holdDraft, newSession, saveSession } from '../lib/sessions.js'

function cap(value) {
  const text = String(value ?? '')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

function scoreTone(pct) {
  if (pct >= 70) return 'success'
  if (pct >= 40) return 'warning'
  return 'danger'
}

function formatStamp(value) {
  if (!value) return ''
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}

function formatDate(value) {
  if (!value) return 'Recent'
  const date = new Date(value)
  if (isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'History' }])

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
        if (active) setError(err.message ?? 'Failed to load history')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  // Group attempts by date and topic
  const groupedSessions = useMemo(() => {
    const groups = []
    const map = new Map()

    for (const item of history) {
      const stamp = item.submitted_at || item.created_at
      const dateKey = stamp ? stamp.slice(0, 10) : 'Recent'
      const key = `${dateKey}::${item.topic || 'General'}`

      if (!map.has(key)) {
        const group = {
          key,
          dateKey,
          dateFormatted: formatDate(stamp),
          topic: item.topic || 'General',
          attempts: [],
        }
        map.set(key, group)
        groups.push(group)
      }

      map.get(key).attempts.push(item)
    }

    // Compute session aggregates and sort attempts chronologically (Q1 = first answered)
    return groups.map((g) => {
      const sortedAttempts = [...g.attempts].sort((a, b) => {
        const ta = new Date(a.submitted_at || a.created_at || 0).getTime()
        const tb = new Date(b.submitted_at || b.created_at || 0).getTime()
        return ta - tb
      })
      const totalScore = sortedAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0)
      const avgScore = Math.round((totalScore / sortedAttempts.length) * 100)
      return {
        ...g,
        attempts: sortedAttempts,
        avgScore,
        count: sortedAttempts.length,
      }
    })
  }, [history])

  const startTopicPractice = (topicName) => {
    const session = newSession({
      scope: 'adaptive',
      subject: null,
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
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="history-page">
      <PageHeader
        title="Practice History"
        description="Chronological record of evaluated attempts grouped by date and topic."
        actions={
          <Button icon={<IconPlus size={16} />} onClick={() => navigate('/practice')}>
            New practice
          </Button>
        }
      />

      {groupedSessions.length === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={IconClock}
            title="No previous attempts"
            description="Start your first practice session to build your study history."
            action={
              <Button onClick={() => navigate('/practice')} icon={<IconPlus size={16} />}>
                Start practice
              </Button>
            }
          />
        </PanelLarge>
      ) : (
        <div className="space-y-4" data-testid="history-groups">
          {groupedSessions.map((group) => (
            <PanelLarge key={group.key} className="space-y-3" data-testid={`history-group-${group.topic}`}>
              {/* Session Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex items-center gap-3">
                  <ProgressRing value={group.avgScore} size={42} tone={scoreTone(group.avgScore)} />
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{group.topic}</h3>
                    <p className="text-xs text-muted">
                      {group.dateFormatted} • {group.count} question{group.count !== 1 ? 's' : ''} answered
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={group.avgScore >= 70 ? 'success' : group.avgScore >= 40 ? 'warning' : 'danger'}
                    label={`Avg: ${group.avgScore}%`}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<IconArrowRight size={14} />}
                    onClick={() => startTopicPractice(group.topic)}
                  >
                    Practice again
                  </Button>
                </div>
              </div>

              {/* Questions in this session */}
              <div className="divide-y divide-line pt-1">
                {group.attempts.map((item, idx) => {
                  const pct = Math.round((Number(item.score) || 0) * 100)
                  const time = formatStamp(item.submitted_at || item.created_at)

                  return (
                    <div
                      key={item.attempt_id || idx}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted w-5">Q{idx + 1}</span>
                        {item.bloom_level && <Badge variant="primary" label={cap(item.bloom_level)} />}
                        {item.difficulty && <Badge variant="neutral" label={cap(item.difficulty)} />}
                        {time && <span className="text-muted ml-1">{time}</span>}
                      </div>

                      <span className={`font-mono font-semibold tabular-nums text-${scoreTone(pct)}`}>
                        {pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </PanelLarge>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
