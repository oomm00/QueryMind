/**
 * HistoryPage — /history (Placeholder)
 * Shows previous attempt history (using history mock / endpoint)
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { attemptsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function HistoryPage() {
  const { userId } = useAuth()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!userId) return

    attemptsApi
      .getHistory(userId)
      .then((data) => {
        if (active) setHistory(Array.isArray(data) ? data : data?.attempts ?? [])
      })
      .catch((err) => console.warn('Failed to load history', err))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [userId])

  return (
    <div className="page-wrapper items-start py-8">
      <div className="w-full max-w-4xl mx-auto animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white">Attempt History</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Review your past study questions, answers, and scores.
            </p>
          </div>
          <Link to="/setup" className="btn-primary">
            + New Session
          </Link>
        </div>

        {loading ? (
          <div className="card text-center py-12 text-zinc-400 animate-pulse-soft">
            <span className="text-2xl mb-2 block">⏳</span>
            Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="card text-center py-12 text-zinc-400">
            <p className="text-sm mb-4">No previous attempts recorded yet.</p>
            <Link to="/setup" className="btn-primary">Start Your First Session</Link>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 border-b border-surface-border text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-3 px-4">Topic</th>
                  <th className="py-3 px-4">Bloom Level</th>
                  <th className="py-3 px-4">Difficulty</th>
                  <th className="py-3 px-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {history.map((item, idx) => (
                  <tr key={item.attempt_id || idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-white">{item.topic}</td>
                    <td className="py-3.5 px-4 capitalize text-zinc-300">{item.bloom_level}</td>
                    <td className="py-3.5 px-4 capitalize text-zinc-400">{item.difficulty}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-400">
                      {Math.round((item.score ?? 0) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
