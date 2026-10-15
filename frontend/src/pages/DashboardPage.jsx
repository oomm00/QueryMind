/**
 * DashboardPage — /dashboard
 * Mastery Dashboard displaying cognitive knowledge profiles.
 * Uses selectors to aggregate mastery_breakdown rows into:
 *  1. Per-topic averages
 *  2. Per-Bloom-level averages
 * Eliminates nil-UUID fallback and uses AuthContext.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { profileApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  selectPerTopicAverages,
  selectPerBloomAverages,
} from '../api/adapter.js'
import { getBloomColor } from '../constants/bloomTaxonomy.js'

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
      <div className="page-wrapper items-center justify-center">
        <div className="text-center animate-pulse-soft">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-xs text-zinc-400 font-mono">Aggregating mastery profiles…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrapper items-center justify-center">
        <div className="card max-w-md text-center p-6 space-y-4">
          <p className="text-sm text-rose-400">⚠️ {error}</p>
          <button onClick={() => navigate('/setup')} className="btn-ghost">
            ← Return to Setup
          </button>
        </div>
      </div>
    )
  }

  const breakdown = profile?.mastery_breakdown ?? []
  const topicAverages = selectPerTopicAverages(breakdown)
  const bloomAverages = selectPerBloomAverages(breakdown)

  return (
    <div className="page-wrapper items-start py-8">
      <div className="w-full max-w-4xl mx-auto animate-slide-up space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              Mastery Dashboard
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Performance telemetry for {user?.email || 'authenticated user'}
            </p>
          </div>

          <Link to="/setup" className="btn-primary self-start sm:self-auto">
            + New Study Session
          </Link>
        </div>

        {/* Top-Level Metric Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Total Attempts"
            value={profile?.total_attempts ?? 0}
            icon="🎯"
          />
          <StatCard
            label="Average Score"
            value={`${Math.round((profile?.average_score ?? 0) * 100)}%`}
            icon="📈"
          />
          <StatCard
            label="Tracked Topics"
            value={topicAverages.length}
            icon="📚"
          />
        </div>

        {/* Mastery Breakdown: By Topic */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>📚</span>
              <span>Topic Mastery (Aggregated)</span>
            </h2>
            <span className="text-xs text-zinc-500 font-mono">
              {topicAverages.length} topics evaluated
            </span>
          </div>

          <div className="space-y-3.5">
            {topicAverages.map((item) => (
              <MetricBar
                key={item.topic}
                title={item.topic}
                subtitle={`${item.total_attempts} attempt${item.total_attempts !== 1 ? 's' : ''}`}
                score={item.average_score}
                color="#6366f1"
              />
            ))}
            {topicAverages.length === 0 && (
              <p className="text-xs text-zinc-500 py-4 text-center">
                No topic data recorded yet. Complete a study session to populate.
              </p>
            )}
          </div>
        </div>

        {/* Mastery Breakdown: By Bloom's Taxonomy Level */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>🧠</span>
              <span>Cognitive Depth (Bloom Taxonomy)</span>
            </h2>
            <span className="text-xs text-zinc-500 font-mono">
              6-level cognitive scale
            </span>
          </div>

          <div className="space-y-3.5">
            {bloomAverages.map((item) => {
              const color = getBloomColor(item.bloom_level)
              return (
                <MetricBar
                  key={item.bloom_level}
                  title={item.bloom_level}
                  subtitle={`${item.total_attempts} question${item.total_attempts !== 1 ? 's' : ''}`}
                  score={item.average_score}
                  color={color}
                  titleClassName="capitalize"
                />
              )
            })}
            {bloomAverages.length === 0 && (
              <p className="text-xs text-zinc-500 py-4 text-center">
                No Bloom cognitive data available yet.
              </p>
            )}
          </div>
        </div>

        {profile?.stub && (
          <p className="text-[11px] text-zinc-500 text-center font-mono">
            ℹ️ Telemetry populated via mock evaluation profiles
          </p>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="card text-center py-5">
      <div className="text-xl mb-1.5">{icon}</div>
      <p className="text-2xl font-display font-bold text-white tracking-tight">{value}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function MetricBar({ title, subtitle, score, color, titleClassName = '' }) {
  const pct = Math.round(score * 100)

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className={`font-medium text-white ${titleClassName}`}>
          {title}
          {subtitle && (
            <span className="ml-2 text-zinc-500 font-normal text-[11px]">
              • {subtitle}
            </span>
          )}
        </span>
        <span className="font-mono font-semibold text-zinc-200">{pct}%</span>
      </div>
      <div className="h-2 bg-zinc-900 border border-surface-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
