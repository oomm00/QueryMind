/**
 * SetupPage — /setup
 * Preparation Setup form: goal, topic, Bloom level, difficulty.
 * Stub: on submit, navigates to /question with form data in state.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BLOOM_LEVELS = [
  { value: 'remember',   label: 'Remember',   emoji: '📌', desc: 'Recall facts' },
  { value: 'understand', label: 'Understand',  emoji: '💡', desc: 'Explain concepts' },
  { value: 'apply',      label: 'Apply',       emoji: '🔧', desc: 'Use in new situations' },
  { value: 'analyze',    label: 'Analyze',     emoji: '🔍', desc: 'Break down components' },
  { value: 'evaluate',   label: 'Evaluate',    emoji: '⚖️', desc: 'Make judgements' },
  { value: 'create',     label: 'Create',      emoji: '✨', desc: 'Produce new work' },
]

const DIFFICULTIES = ['easy', 'medium', 'hard']

export default function SetupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    goal:       '',
    topic:      '',
    bloom:      'understand',
    difficulty: 'medium',
    numQ:       3,
  })

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    // Pass setup config to question page via router state
    navigate('/question', { state: { setup: form } })
  }

  return (
    <div className="page-wrapper items-start py-12">
      <div className="w-full max-w-2xl mx-auto animate-slide-up">
        {/* Header */}
        <div className="mb-8">
          <button onClick={() => navigate('/login')} className="text-[var(--color-muted)] hover:text-white text-sm mb-4 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-3xl font-display font-bold text-white">Preparation Setup</h1>
          <p className="text-[var(--color-muted)] mt-1">
            Tell QueryMind what you want to study and how hard to push you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Goal */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">🎯 Learning Goal</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="goal" className="label">What do you want to achieve?</label>
                <input
                  id="goal"
                  name="goal"
                  type="text"
                  placeholder="e.g. Pass the AWS Solutions Architect exam"
                  value={form.goal}
                  onChange={handleChange}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="topic" className="label">Topic / Subject area *</label>
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  placeholder="e.g. Python decorators, Neural networks, SQL joins"
                  value={form.topic}
                  onChange={handleChange}
                  required
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Bloom Level */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">🧠 Bloom's Taxonomy Level</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BLOOM_LEVELS.map((level) => (
                <label
                  key={level.value}
                  htmlFor={`bloom-${level.value}`}
                  className={`cursor-pointer flex flex-col gap-1 p-4 rounded-xl border-2 transition-all duration-200 ${
                    form.bloom === level.value
                      ? 'border-brand-500 bg-brand-950/50'
                      : 'border-surface-border hover:border-brand-700'
                  }`}
                >
                  <input
                    type="radio"
                    id={`bloom-${level.value}`}
                    name="bloom"
                    value={level.value}
                    checked={form.bloom === level.value}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className="text-xl">{level.emoji}</span>
                  <span className="font-semibold text-white text-sm">{level.label}</span>
                  <span className="text-xs text-[var(--color-muted)]">{level.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Difficulty & Quantity */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">⚙️ Difficulty & Quantity</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="difficulty" className="label">Difficulty</label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="input"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d} className="bg-surface-card capitalize">{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="numQ" className="label">Number of questions (1–10)</label>
                <input
                  id="numQ"
                  name="numQ"
                  type="number"
                  min={1}
                  max={10}
                  value={form.numQ}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>
          </div>

          <button id="btn-start-session" type="submit" className="btn-primary w-full py-4 text-base">
            Start Study Session →
          </button>
        </form>
      </div>
    </div>
  )
}
