/**
 * HistoryPage — /history
 * Shows previous attempt history.
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'
import { Badge } from '../components/ui/Badge'
import { ProgressRing } from '../components/ui/ProgressRing'
import { EmptyState } from '../components/ui/EmptyState'
import { Toast } from '../components/ui/Toast'
import { Skeleton } from '../components/ui/Skeleton'
import { buttonClasses } from '../components/ui/Button'
import { IconPlus, IconClock } from '../components/ui/Icons'

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
  return Number.isFinite(time) ? new Date(time).toLocaleString() : ''
}

export default function HistoryPage() {
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'History' }])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) return

    attemptsApi
      .getHistory(userId)
      .then((data) => {
        if (active) {
          const list = Array.isArray(data) ? data : data?.attempts ?? []
          setHistory(list)
          if (!list.length) {
            setToast({
              title: 'No history',
              description: 'No previous attempts recorded yet.',
              variant: 'default',
            })
          }
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message ?? 'Failed to load history')
          setToast({
            title: 'Failed to load history',
            description: err.message ?? 'Failed to load history',
            variant: 'error',
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  return (
    <div>
      <PageHeader
        title="History"
        description="Review your past study questions, answers, and scores."
        actions={
          <Link to="/practice/new" className={buttonClasses({ variant: 'primary' })}>
            <IconPlus size={16} />
            New session
          </Link>
        }
      />

      {loading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading history…</span>
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : history.length === 0 ? (
        <Panel>
          <EmptyState
            icon={IconClock}
            title="No previous attempts"
            description="Start your first study session to build your history."
            action={
              <Link
                to="/practice/new"
                className={buttonClasses({ variant: 'primary', size: 'sm' })}
              >
                New session
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {history.map((item, idx) => {
            const pct = Math.round((item.score ?? 0) * 100)
            const stamp = formatStamp(
              item.submitted_at || item.created_at || item.timestamp || item.createdAt
            )

            return (
              <Panel
                key={item.attempt_id || idx}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-raised"
              >
                <ProgressRing value={pct} size={46} tone={scoreTone(pct)} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.topic}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {item.bloom_level && <Badge variant="primary" label={cap(item.bloom_level)} />}
                    {item.difficulty && <Badge variant="neutral" label={cap(item.difficulty)} />}
                    {stamp && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <IconClock size={13} />
                        {stamp}
                      </span>
                    )}
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
