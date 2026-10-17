/**
 * SetupPage — /practice/new
 * Preparation Setup form: goal, topic, Bloom level, difficulty, and question count.
 * Uses questionsApi.generate and initializes SessionContext before navigating to /practice/session.
 */

import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { questionsApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSession } from '../context/SessionContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { BLOOM_LEVELS, DIFFICULTIES } from '../constants/bloomTaxonomy.js'
import { cx } from '../lib/cx'
import { clampPracticeCount } from '../lib/practiceLink'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Panel } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { ErrorState } from '../components/ui/ErrorState'
import { IconTarget, IconLearning, IconSettings } from '../components/ui/Icons'

function SectionHeading({ icon: Icon, children }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
      <Icon size={15} />
      {children}
    </h2>
  )
}

export default function SetupPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { initSession } = useSession()
  const [searchParams] = useSearchParams()
  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'New session' },
  ])

  // A link can arrive with a prepared topic and question count, e.g. from a
  // concept on the knowledge graph. Both are optional and validated here.
  const [form, setForm] = useState(() => ({
    goal: '',
    topic: searchParams.get('topic')?.trim() ?? '',
    bloom: 'understand',
    difficulty: 'medium',
    count: searchParams.has('count') ? clampPracticeCount(searchParams.get('count')) : 3,
  }))

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
      navigate('/practice/session')
    } catch (err) {
      setError(err.message ?? 'Failed to generate session questions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Preparation setup"
        description="Configure your target domain, cognitive depth, and question count."
      />

      {error && (
        <ErrorState className="mb-4" title="Could not start session" message={error} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Target & topic */}
        <Panel className="p-5">
          <SectionHeading icon={IconTarget}>Learning objective</SectionHeading>

          <div className="space-y-3">
            <Input
              id="goal"
              name="goal"
              type="text"
              label="Goal (optional)"
              placeholder="e.g. Pass AWS Solutions Architect, Technical interview prep"
              value={form.goal}
              onChange={handleChange}
            />

            <Input
              id="topic"
              name="topic"
              type="text"
              label="Topic"
              placeholder="e.g. Distributed consensus, SQL query optimization, Concurrency"
              value={form.topic}
              onChange={handleChange}
              required
            />
          </div>
        </Panel>

        {/* Bloom's taxonomy level */}
        <Panel className="p-5">
          <SectionHeading icon={IconLearning}>Bloom&apos;s cognitive level</SectionHeading>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {BLOOM_LEVELS.map((level) => {
              const isSelected = form.bloom === level.value
              return (
                <label
                  key={level.value}
                  htmlFor={`bloom-${level.value}`}
                  className={cx(
                    'flex cursor-pointer flex-col rounded-control border p-3 transition-colors duration-150',
                    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
                    isSelected
                      ? 'border-primary bg-primary-tint'
                      : 'border-line bg-surface-raised hover:border-line-strong'
                  )}
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
                  <span className="mb-1 text-sm font-medium capitalize text-ink">
                    {level.label}
                  </span>
                  <span className="text-[11px] leading-tight text-muted">{level.desc}</span>
                </label>
              )
            })}
          </div>
        </Panel>

        {/* Difficulty & count */}
        <Panel className="p-5">
          <SectionHeading icon={IconSettings}>Session scope</SectionHeading>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="difficulty"
              name="difficulty"
              label="Difficulty"
              value={form.difficulty}
              onChange={handleChange}
              options={DIFFICULTIES}
            />

            <Input
              id="count"
              name="count"
              type="number"
              label="Number of questions (1–10)"
              min={1}
              max={10}
              value={form.count}
              onChange={handleChange}
            />
          </div>
        </Panel>

        <Button
          id="btn-start-session"
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          disabled={!form.topic.trim()}
        >
          {loading ? 'Synthesizing session questions…' : 'Start study session'}
        </Button>
      </form>
    </div>
  )
}
