/**
 * DashboardPage — /dashboard
 * Mastery Dashboard: fetches knowledge profile and renders a placeholder bar chart.
 * Styled example component confirming Tailwind is fully working.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi } from '../api/client.js'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const userId = localStorage.getItem('qm_user_id') ?? '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    profileApi
      .get(userId)
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="page-wrapper">
      <div className="text-center animate-pulse-soft">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-[var(--color-muted)]">Loading your profile…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="page-wrapper">
      <div className="card max-w-md text-center">
        <p className="text-red-400 mb-4">⚠️ {error}</p>
        <button onClick={() => navigate('/setup')} className="btn-ghost">← Back</button>
      </div>
    </div>
  )

  return (
    <div className="page-wrapper items-start py-12">
      <div className="w-full max-w-3xl mx-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Mastery Dashboard</h1>
            <p className="text-[var(--color-muted)] mt-1 text-sm">
              Your knowledge profile at a glance.
            </p>
          </div>
          <button
            id="btn-new-session"
            onClick={() => navigate('/setup')}
            className="btn-primary"
          >
            + New Session
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Attempts" value={profile?.total_attempts ?? 0} icon="🎯" />
          <StatCard label="Avg Score"      value={`${Math.round((profile?.average_score ?? 0) * 100)}%`} icon="📈" />
          <StatCard label="Topics"         value={new Set(profile?.mastery_breakdown?.map(m => m.topic)).size} icon="📚" />
        </div>

        {/* Mastery Breakdown — Placeholder Bar Chart */}
        <div className="card mb-6">
          <h2 className="font-semibold text-white mb-6">📊 Mastery by Topic & Bloom Level</h2>
          <div className="space-y-4">
            {(profile?.mastery_breakdown ?? []).map((item, i) => (
              <MasteryBar key={i} item={item} />
            ))}
          </div>
          {profile?.stub && (
            <p className="text-xs text-[var(--color-muted)] mt-6 border-t border-surface-border pt-4">
              ⚠️ Stub data — real mastery tracking will be computed from your actual attempt history.
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-center">
          <button onClick={() => navigate('/login')} className="btn-ghost text-sm">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

/** ── Sub-components ───────────────────────────────────────── */

function StatCard({ label, value, icon }) {
  return (
    <div className="card text-center py-6">
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="text-xs text-[var(--color-muted)] mt-1">{label}</p>
    </div>
  )
}

function MasteryBar({ item }) {
  const pct = Math.round(item.mastery_score * 100)
  const barColor =
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-yellow-400'  :
    pct >= 30 ? 'bg-orange-400'  : 'bg-red-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-white font-medium">
          {item.topic}
          <span className="ml-2 text-xs text-[var(--color-muted)] capitalize">· {item.bloom_level}</span>
        </span>
        <span className="text-xs font-semibold text-white">{pct}%</span>
      </div>
      <div className="h-2 bg-surface-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-[var(--color-muted)] mt-1">{item.attempts} attempt{item.attempts !== 1 ? 's' : ''}</p>
    </div>
  )
}
