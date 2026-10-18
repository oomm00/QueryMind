/**
 * WeakAreasPage — /weak-areas
 * Highlights concepts and topics where mastery score is below proficiency threshold (<70%).
 */

import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useMastery, useProgress } from '../lib/masteryStore'
import { usePracticeData } from '../hooks/usePracticeData'
import { contentCourseIds } from '../content/practiceBank'
import { createRegistry } from '../content/registry'
import { PageHeader } from '../components/ui/PageHeader'
import { PanelLarge } from '../components/ui/Panel'
import { MetricBar } from '../components/ui/MetricBar'
import { Badge } from '../components/ui/Badge'
import { Button, buttonClasses } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { IconWeakAreas, IconTarget, IconSparkles } from '../components/ui/Icons'

function percent(val) {
  if (val == null || !Number.isFinite(val)) return '—'
  return `${Math.round(val * 100)}%`
}

export default function WeakAreasPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Weak Areas' }])

  const estimates = useMastery(userId)
  const progress = useProgress(userId)
  const { data: courses = [] } = usePracticeData(contentCourseIds())

  const registry = useMemo(() => createRegistry(courses), [courses])

  // Discover all concepts with estimates < 0.70
  const weakConcepts = useMemo(() => {
    const list = []
    const allConcepts = registry.allConcepts()

    for (const concept of allConcepts) {
      const est = estimates[concept.id]
      if (typeof est === 'number' && Number.isFinite(est) && est < 0.7) {
        list.push({
          id: concept.id,
          title: concept.title,
          subject: concept.subject || 'General',
          topicId: concept.topicId,
          courseId: concept.courseId,
          estimate: est,
        })
      }
    }

    // Also include custom concepts created during generation runs
    const storedConcepts = progress?.concepts ?? {}
    for (const [id, record] of Object.entries(storedConcepts)) {
      if (id.startsWith('custom:') && typeof record.estimate === 'number' && record.estimate < 0.7) {
        if (!list.some((item) => item.id === id)) {
          list.push({
            id,
            title: record.title || id.replace('custom:', ''),
            subject: record.subject || 'Custom Topic',
            estimate: record.estimate,
          })
        }
      }
    }

    return list.sort((a, b) => a.estimate - b.estimate)
  }, [registry, estimates, progress])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Weak Areas"
        description="Concepts and topics where your current accuracy is below the 70% proficiency target."
        actions={
          <Button
            icon={<IconSparkles size={16} />}
            onClick={() => navigate('/practice')}
          >
            Practice AI Questions
          </Button>
        }
      />

      <PanelLarge>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Areas Requiring Attention ({weakConcepts.length})</h2>
            <p className="mt-0.5 text-xs text-muted">
              Targeted practice on these areas directly accelerates your overall exam readiness.
            </p>
          </div>
        </div>

        {weakConcepts.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={IconTarget}
              title="No weak areas identified!"
              description="Great job! All your tracked concepts are at or above 70% mastery, or you haven't answered questions yet."
              action={
                <Link to="/practice" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
                  Practice more questions
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {weakConcepts.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-ink">{item.title}</p>
                    <Badge tone="neutral" label={item.subject} />
                  </div>
                  <div className="mt-2 max-w-sm">
                    <MetricBar
                      label="Current Accuracy"
                      subtitle={percent(item.estimate)}
                      score={item.estimate}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate('/practice')
                    }}
                  >
                    Drill topic
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelLarge>
    </div>
  )
}
