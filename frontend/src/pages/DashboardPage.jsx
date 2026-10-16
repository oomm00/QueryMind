/**
 * DashboardPage — /dashboard
 * Mastery Dashboard displaying cognitive knowledge profiles.
 * Uses selectors to aggregate mastery_breakdown rows into:
 *  1. Per-topic averages
 *  2. Per-Bloom-level averages
 * Eliminates nil-UUID fallback and uses AuthContext.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { selectPerTopicAverages, selectPerBloomAverages } from '../api/adapter.js'
import { getBloomColor } from '../constants/bloomTaxonomy.js'
import { Button } from '../components/ui/Button'
import { Panel, PanelLarge } from '../components/ui/Panel'
import { MetricBar } from '../components/ui/MetricBar'
import { EmptyState } from '../components/ui/EmptyState'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { userId, user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    profileApi
      .getProfile(userId)
      .then((data) => {
        if (active) setProfile(data)
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load profile')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <Panel className="text-center">
          <div className="animate-spin h-12 w-12 rounded-md flex items-center justify-center"></div>
          <p className="mt-2 text-[var(--muted)]">Aggregating mastery profiles…</p>
        </Panel>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <Panel className="text-center max-w-md">
          <p className="text-[var(--rust)]">⚠️ {error}</p>
          <Button
            variant="quiet"
            onClick={() => navigate('/setup')}
            className="mt-3"
          >
            Return to Setup
          </Button>
        </Panel>
      </div>
    )
  }

  const breakdown = profile?.mastery_breakdown ?? []
  const topicAverages = selectPerTopicAverages(breakdown)
  const bloomAverages = selectPerBloomAverages(breakdown)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <PanelLarge className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display font-bold text-[var(--ink)] tracking-tight">
                Mastery Dashboard
              </h1>
              <p className="text-[var(--muted)] mt-1">
                Performance telemetry for {user?.email || 'authenticated user'}
              </p>
            </div>

            <Button
              variant="quiet"
              onClick={() => navigate('/setup')}
              className="sm:self-auto"
            >
              + New Study Session
            </Button>
          </div>
        </PanelLarge>

        {/* Top-Level Metric Stats */}
        <Panel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricBar
              label="Total Attempts"
              value={profile?.total_attempts ?? 0}
              icon="🎯"
            />
            <MetricBar
              label="Average Score"
              value={`${Math.round((profile?.average_score ?? 0) * 100)}%`}
              icon="📈"
            />
            <MetricBar
              label="Tracked Topics"
              value={topicAverages.length}
              icon="📚"
            />
          </div>
        </Panel>

        {/* Mastery Breakdown: By Topic */}
        <Panel>
          <div>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              Topic Mastery
            </h2>
            {topicAverages.length === 0 ? (
              <EmptyState
                icon="ℹ️"
                title="No topic data yet"
                description="Complete a study session to populate your mastery breakdown."
              />
            ) : (
              <div className="space-y-3">
                {topicAverages.map((item) => (
                  <MetricBar
                    key={item.topic}
                    label={item.topic}
                    subtitle={`${item.total_attempts} attempt${item.total_attempts !== 1 ? 's' : ''}`}
                    score={item.average_score}
                    color={getBloomColor(item.topic)}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* Mastery Breakdown: By Bloom's Taxonomy Level */}
        <Panel>
          <div>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              Cognitive Depth (Bloom Taxonomy)
            </h2>
            {bloomAverages.length === 0 ? (
              <EmptyState
                icon="ℹ️"
                title="No Bloom data yet"
                description="Complete study sessions to see cognitive level progress."
              />
            ) : (
              <div className="space-y-3">
                {bloomAverages.map((item) => (
                  <MetricBar
                    key={item.bloom_level}
                    label={item.bloom_level}
                    subtitle={`${item.total_attempts} question${item.total_attempts !== 1 ? 's' : ''}`}
                    score={item.average_score}
                    color={getBloomColor(item.bloom_level)}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
