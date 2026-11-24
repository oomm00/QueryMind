/**
 * TopicDetailPage — /my-learning/:topicId
 * Detailed structured topic breakdown:
 * - 5-8 sub-parts outline with status badges (completed, current, upcoming)
 * - 2-3 sentence AI summaries and learning goals per part
 * - Curated verified external resource links
 * - Current rung and mastery progress bar
 * - Primary action button: Start / Continue adaptive practice
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchLearningTopic } from '../api/endpoints/learning.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ProgressLine } from '../components/ui/ProgressLine.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { IconTarget, IconLearning, IconClock, IconArrowRight } from '../components/ui/Icons.jsx'
import { holdDraft, newSession, saveSession } from '../lib/sessions.js'

export default function TopicDetailPage() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()

  const [topicData, setTopicData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'My Learning', to: '/my-learning' },
    { label: topicData?.topic || 'Topic Outline' },
  ])

  useEffect(() => {
    let active = true
    if (!topicId) return

    fetchLearningTopic(topicId)
      .then((data) => {
        if (active) setTopicData(data)
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load topic outline')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [topicId])

  const handleStartPractice = () => {
    if (!topicData) return
    const session = newSession({
      scope: 'adaptive',
      subject: topicData.subject || null,
      topic: topicData.topic,
      label: topicData.topic,
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
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !topicData) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Panel className="border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger">
          <p>{error || 'Topic not found.'}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => navigate('/my-learning')}>
              Back to My Learning
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  const { topic, subject, overview, subparts = [], resources = [], progress = {} } = topicData
  const completedCount = progress.completed_subparts || 0
  const masteryPct = progress.mastery_pct || 0
  const currentRung = progress.current_rung || 'Remember / Easy'
  const totalAttempts = progress.total_attempts || 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/my-learning" className="text-xs text-muted hover:text-ink transition-colors">
              &larr; My Learning
            </Link>
            <span className="text-muted">/</span>
            <Badge variant="subtle" size="sm">
              {subject || 'General'}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {topic}
          </h1>
        </div>

        <Button size="md" variant="primary" onClick={handleStartPractice}>
          <IconTarget className="mr-2 h-4 w-4" />
          {totalAttempts > 0 ? 'Continue Practice' : 'Start Practice'}
        </Button>
      </div>

      {/* Progress & Overview Card */}
      <PanelLarge className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Adaptive Mastery Level
            </span>
            <div className="text-lg font-bold text-ink">{currentRung}</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <span className="block text-xs text-muted">Questions Attempted</span>
              <span className="font-semibold text-ink">{totalAttempts}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-muted">Mastery</span>
              <span className="font-semibold text-ink">{masteryPct}%</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>Outline Completion ({completedCount} of {subparts.length} parts)</span>
            <span>{Math.round((completedCount / Math.max(1, subparts.length)) * 100)}%</span>
          </div>
          <ProgressLine value={completedCount} max={Math.max(1, subparts.length)} />
        </div>

        <p className="text-sm text-ink/80 leading-relaxed pt-2 border-t border-line/60">
          {overview}
        </p>
      </PanelLarge>

      {/* 5-8 Subparts Outline */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Topic Learning Outline</h2>
        <div className="space-y-3">
          {subparts.map((part, index) => {
            const isCompleted = index < completedCount
            const isCurrent = index === completedCount
            const statusVariant = isCompleted ? 'success' : isCurrent ? 'primary' : 'subtle'
            const statusLabel = isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Upcoming'

            return (
              <Panel
                key={part.id || index}
                className={`transition-all border p-4 sm:p-5 ${
                  isCurrent
                    ? 'border-primary/50 bg-primary/5 shadow-sm'
                    : isCompleted
                    ? 'border-line/80 bg-surface/80'
                    : 'border-line/40 bg-surface/40 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-ink">
                        {index + 1}
                      </span>
                      <h3 className="text-sm font-semibold text-ink">{part.title}</h3>
                      <Badge variant={statusVariant} size="sm">
                        {statusLabel}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted leading-relaxed pl-8">
                      {part.summary}
                    </p>

                    {part.learning_goals && part.learning_goals.length > 0 && (
                      <div className="pl-8 pt-1">
                        <ul className="list-disc pl-4 text-[11px] text-muted space-y-0.5">
                          {part.learning_goals.map((goal, gIdx) => (
                            <li key={gIdx}>{goal}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="sm:self-center pl-8 sm:pl-0">
                    <Button
                      size="sm"
                      variant={isCurrent ? 'primary' : 'secondary'}
                      onClick={handleStartPractice}
                    >
                      {isCompleted ? 'Review' : isCurrent ? 'Practice Part' : 'Preview'}
                    </Button>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      </div>

      {/* Curated Resources Section */}
      {resources && resources.length > 0 && (
        <div className="space-y-4 pt-4">
          <h2 className="text-base font-semibold text-ink">Curated Resources & Documentation</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {resources.map((res, rIdx) => (
              <a
                key={rIdx}
                href={res.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center justify-between rounded-card border border-line bg-surface p-4 transition duration-150 hover:border-line-strong hover:bg-surface-raised"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-ink group-hover:text-primary transition-colors">
                    {res.title || res.name}
                  </div>
                  <div className="text-[11px] text-muted truncate max-w-sm">
                    {res.url}
                  </div>
                </div>
                <span className="text-muted group-hover:text-ink text-xs transition-colors">
                  &nearr;
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
