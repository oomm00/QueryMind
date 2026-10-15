/**
 * SetupPage — /setup
 * Preparation Setup form: goal, topic, Bloom level, difficulty, and question count.
 * Uses questionsApi.generate and initializes SessionContext before navigating to /question.
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { questionsApi } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { BLOOM_LEVELS, DIFFICULTIES } from '../constants/bloomTaxonomy.js'

export default function SetupPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { initSession } = useSession()

  const [form, setForm] = useState({
    goal: '',
    topic: '',
    bloom: 'understand',
    difficulty: 'medium',
    count: 3,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.topic.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await questionsApi.generate(
        {
          topic: form.topic,
          bloom_level: form.bloom,
          difficulty: form.difficulty,
          count: Number(form.count),
        },
        userId
      )

      const questionsList = response?.questions ?? []
      if (questionsList.length === 0) {
        throw new Error('No questions could be generated. Please try another topic.')
      }

      // Initialize persistent study session in SessionContext
      initSession(form, questionsList)
      navigate('/question')
    } catch (err) {
      setError(err.message ?? 'Failed to generate session questions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper items-start py-8">
      <div className="w-full max-w-2xl mx-auto animate-slide-up space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">
            Preparation Setup
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Configure your target domain, cognitive depth, and question count.
          </p>
        </div>

        {error && (
          <div className="text-rose-400 text-xs bg-rose-950/40 border border-rose-900/60 rounded-lg p-3">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Target & Topic */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <span>🎯</span>
              <span>Learning Objective</span>
            </h2>

            <div>
              <label htmlFor="goal" className="label">Target Exam or Objective</label>
              <input
                id="goal"
                name="goal"
                type="text"
                placeholder="e.g. Pass AWS Solutions Architect, Technical Interview Prep"
                value={form.goal}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="topic" className="label">Topic / Subject Area *</label>
              <input
                id="topic"
                name="topic"
                type="text"
                placeholder="e.g. Distributed Consensus, SQL Query Optimization, Concurrency"
                value={form.topic}
                onChange={handleChange}
                required
                className="input"
              />
            </div>
          </div>

          {/* Bloom's Taxonomy Level */}
          <div className="card">
            <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
              <span>🧠</span>
              <span>Bloom's Cognitive Level</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BLOOM_LEVELS.map((level) => {
                const isSelected = form.bloom === level.value
                return (
                  <label
                    key={level.value}
                    htmlFor={`bloom-${level.value}`}
                    className={`cursor-pointer flex flex-col p-3 rounded-lg border transition-all duration-150 ${
                      isSelected
                        ? 'border-brand-500 bg-brand-950/30 ring-1 ring-brand-500'
                        : 'border-surface-border bg-zinc-950/40 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      id={`bloom-${level.value}`}
                      name="bloom"
                      value={level.value}
                      checked={isSelected}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{level.emoji}</span>
                      <span className="font-medium text-white text-xs capitalize">
                        {level.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 leading-tight">
                      {level.desc}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Difficulty & Count */}
          <div className="card">
            <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
              <span>⚙️</span>
              <span>Session Scope</span>
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="difficulty" className="label">Difficulty</label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="input capitalize"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d.value} value={d.value} className="bg-zinc-900">
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="count" className="label">Number of Questions (1–10)</label>
                <input
                  id="count"
                  name="count"
                  type="number"
                  min={1}
                  max={10}
                  value={form.count}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>
          </div>

          <button
            id="btn-start-session"
            type="submit"
            disabled={loading || !form.topic.trim()}
            className="btn-primary w-full py-3 text-sm"
          >
            {loading ? 'Synthesizing Session Questions…' : 'Start Study Session →'}
          </button>
        </form>
      </div>
    </div>
  )
}
