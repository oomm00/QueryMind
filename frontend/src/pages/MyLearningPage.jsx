/**
 * MyLearningPage — /my-learning
 * Displays active learning topics, outline progress, and continuing practice entrypoints.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLearningTopics } from '../api/endpoints/learning.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, PanelLarge } from '../components/ui/Panel.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { ProgressLine } from '../components/ui/ProgressLine.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { IconLearning, IconTarget, IconClock, IconArrowRight, IconPlus } from '../components/ui/Icons.jsx'
import { formatWhen } from '../lib/text.js'
import { holdDraft, newSession, saveSession } from '../lib/sessions.js'

const DEMO_CHIPS = [
  'Deadlocks',
  'Paging and Virtual Memory',
  'TCP Congestion Control',
  'Race Conditions',
  'Process Synchronization',
]

export default function MyLearningPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'My Learning' }])

  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    fetchLearningTopics()
      .then((data) => {
        if (active) setTopics(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load learning topics')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  const handleStartPractice = (topicName, subject) => {
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="My Learning"
        description="Structured topic outlines, verified study resources, and adaptive mastery ladders."
        action={
          <Button size="sm" onClick={() => navigate('/practice')}>
            <IconPlus className="mr-1.5 h-4 w-4" />
            New Topic
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Panel key={n} className="space-y-4 p-5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
            </Panel>
          ))}
        </div>
      ) : error ? (
        <Panel className="border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger">
          <p>{error}</p>
          <Button size="sm" variant="secondary" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Panel>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<IconLearning className="h-10 w-10 text-muted" />}
          title="No topics in your learning plan yet"
          description="Pick a topic to view its structured learning outline, verified study resources, and start adaptive practice."
          action={
            <div className="mt-4 flex flex-col items-center gap-3">
              <Button size="md" onClick={() => navigate('/practice')}>
                Start with a Topic
              </Button>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {DEMO_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleStartPractice(chip, 'Computer Science')}
                    className="rounded-full border border-line bg-surface-raised px-3 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <Panel
              key={t.id}
              className="group flex flex-col justify-between border border-line bg-surface p-5 transition duration-150 hover:border-line-strong hover:bg-surface-raised"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="subtle" size="sm">
                    {t.subject || 'General'}
                  </Badge>
                  <span className="text-xs text-muted">
                    {t.progress?.total_attempts ?? t.questions_attempted ?? 0} questions
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-ink group-hover:text-primary transition-colors">
                    <Link to={`/my-learning/${t.id}`} className="focus:outline-none">
                      {t.title || t.topic}
                    </Link>
                  </h3>
                  <p className="mt-1 text-xs text-muted line-clamp-2">
                    Current level: <span className="font-medium text-ink">{t.progress?.current_rung || t.current_rung || 'Remember / Easy'}</span>
                  </p>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>Mastery</span>
                    <span className="font-semibold text-ink">{Math.round(t.progress?.mastery_pct ?? t.progress_pct ?? 0)}%</span>
                  </div>
                  <ProgressLine value={t.progress?.mastery_pct ?? t.progress_pct ?? 0} max={100} />
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                <Link
                  to={`/my-learning/${t.id}`}
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  View Outline
                  <IconArrowRight className="h-3 w-3" />
                </Link>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleStartPractice(t.title || t.topic, t.subject)}
                >
                  Practice
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
