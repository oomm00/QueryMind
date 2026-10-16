/**
 * HistoryPage — /history
 * Shows previous attempt history.
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Panel, PanelLarge } from '../components/ui/Panel'
import { EmptyState } from '../components/ui/EmptyState'
import { Toast } from '../components/ui/Toast'

export default function HistoryPage() {
  const { userId } = useAuth()
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
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <PanelLarge className="mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-[var(--ink)] tracking-tight">
              Attempt History
            </h1>
            <p className="text-[var(--muted)] mt-1">
              Review your past study questions, answers, and scores.
            </p>
          </div>
        </PanelLarge>

        {loading ? (
          <Panel className="text-center py-8">
            <div className="animate-spin h-6 w-6 mx-auto mb-3"></div>
            <p className="text-[var(--muted)]">Loading history…</p>
          </Panel>
        ) : history.length === 0 ? (
          <EmptyState
            icon="ℹ️"
            title="No previous attempts"
            description="Start your first study session to build your history."
          />
        ) : (
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--line)] border-b">
                  <tr>
                    <th className="py-3 px-4 text-[var(--muted)] uppercase tracking-wider text-xs">
                      Topic
                    </th>
                    <th className="py-3 px-4 text-[var(--muted)] uppercase tracking-wider text-xs">
                      Bloom Level
                    </th>
                    <th className="py-3 px-4 text-[var(--muted)] uppercase tracking-wider text-xs">
                      Difficulty
                    </th>
                    <th className="py-3 px-4 text-right text-[var(--muted)] uppercase tracking-wider text-xs">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {history.map((item, idx) => (
                    <tr key={item.attempt_id || idx} className="hover:bg-[var(--surface)/50] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-[var(--ink)]">
                        {item.topic}
                      </td>
                      <td className="py-3.5 px-4 capitalize text-[var(--muted)]">
                        {item.bloom_level}
                      </td>
                      <td className="py-3.5 px-4 capitalize text-[var(--muted)]">
                        {item.difficulty}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-[var(--ink)]">
                        {Math.round((item.score ?? 0) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <div className="mt-6">
          <Link to="/setup" className="btn-primary">
            + New Session
          </Link>
        </div>

        {error && (
          <p className="mt-4 text-sm text-[var(--rust)]">{error}</p>
        )}

        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  )
}