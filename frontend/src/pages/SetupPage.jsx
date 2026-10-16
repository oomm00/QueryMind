/**
 * SetupPage — /setup
 * Preparation Setup form: goal, topic, Bloom level, difficulty, and question count.
 * Uses questionsApi.generate and initializes SessionContext before navigating to /question.
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { questionsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { BLOOM_LEVELS, DIFFICULTIES } from '../constants/bloomTaxonomy.js'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Panel, PanelLarge, PanelSmall } from '../components/ui/Panel'

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
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-2xl mx-auto py-8">
        {/* Header */}
        <PanelLarge className="mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-[var(--ink)] tracking-tight">
              Preparation Setup
            </h1>
            <p className="text-[var(--muted)] mt-1 text-sm">
              Configure your target domain, cognitive depth, and question count.
            </p>
          </div>
        </PanelLarge>

        {error && (
          <Panel className="mb-4 p-3 rounded-md bg-[var(--rust)/10] border border-[var(--rust)]/50">
            {error}
          </Panel>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Target & Topic */}
          <Panel>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface)/50] px-2.5 py-0.5 text-[var(--muted)]">
                🎯
              </span>
              Learning Objective
            </h2>

            <div className="space-y-3">
              <Input
                id="goal"
                name="goal"
                type="text"
                placeholder="e.g. Pass AWS Solutions Architect, Technical Interview Prep"
                value={form.goal}
                onChange={handleChange}
                className="input"
              />

              <Input
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
          </Panel>

          {/* Bloom's Taxonomy Level */}
          <Panel>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface)/50] px-2.5 py-0.5 text-[var(--muted)]">
                🧠
              </span>
              Bloom's Cognitive Level
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BLOOM_LEVELS.map((level) => {
                const isSelected = form.bloom === level.value
                return (
                  <label
                    key={level.value}
                    htmlFor={`bloom-${level.value}`}
                    className={`cursor-pointer flex flex-col p-3 rounded-md border transition-colors duration-150 ${
                      isSelected
                        ? 'border-[var(--moss)] bg-[var(--moss)/10] ring-1 ring-[var(--moss)]'
                        : 'border-[var(--line)] bg-[var(--surface)/40] hover:border-[var(--moss)]'
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
                      <span className="text-base capitalize">{level.label}</span>
                      {/* emoji removed per design concept */}
                    </div>
                    <span className="text-[10px] text-[var(--muted)] leading-tight">
                      {level.desc}
                    </span>
                  </label>
                )
              })}
            </div>
          </Panel>

          {/* Difficulty & Count */}
          <Panel>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface)/50] px-2.5 py-0.5 text-[var(--muted)]">
                ⚙️
              </span>
              Session Scope
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="difficulty" className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                  Difficulty
                </label>
                <Select
                  id="difficulty"
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="input"
                >
                  <option key="easy" value="easy">
                    Easy
                  </option>
                  <option key="medium" value="medium">
                    Medium
                  </option>
                  <option key="hard" value="hard">
                    Hard
                  </option>
                </Select>
              </div>

              <div>
                <label htmlFor="count" className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                  Number of Questions (1–10)
                </label>
                <Input
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
          </Panel>

          <Button
            id="btn-start-session"
            type="submit"
            disabled={loading || !form.topic.trim()}
            className="w-full py-3"
          >
            {loading ? 'Synthesizing Session Questions…' : 'Start Study Session →'}
          </Button>
        </form>
      </div>
    </div>
  )
}