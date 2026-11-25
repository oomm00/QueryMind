/**
 * TargetedStudyPanel — "Targeted study" setup screen.
 *
 * Allows learner to pick a topic, select a specific Bloom taxonomy cognitive level,
 * and adjust the number of questions (1 to 10, max 10).
 * Questions are streamed: Q1 is requested immediately and subsequent questions
 * are prefetched in the background to eliminate wait times.
 */

import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import * as docHooks from '../../hooks/useDocuments.js'
import { usePracticeData } from '../../hooks/usePracticeData.js'
import { contentCourseIds } from '../../content/practiceBank.js'
import { createRegistry } from '../../content/registry.js'
import { holdDraft, newSession, saveSession } from '../../lib/sessions.js'
import {
  GENERAL_SUBJECT,
  matchingSuggestions,
  subjectForTopic,
  topicSuggestions,
} from '../../lib/generateForm.js'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { PanelLarge } from '../ui/Panel.jsx'
import { IconSparkles, IconTarget, IconArrowRight } from '../ui/Icons.jsx'

const BLOOM_OPTIONS = [
  { level: 'remember', difficulty: 'easy', label: 'Remember', desc: 'Terminology, complexity bounds & definitions' },
  { level: 'understand', difficulty: 'easy', label: 'Understand', desc: 'Core algorithm mechanics & principles' },
  { level: 'apply', difficulty: 'medium', label: 'Apply', desc: 'Trace executions, state transitions & problem solving' },
  { level: 'analyze', difficulty: 'medium', label: 'Analyze', desc: 'Compare invariants & architectural tradeoffs' },
  { level: 'evaluate', difficulty: 'hard', label: 'Evaluate', desc: 'Critique design decisions & concurrency risks' },
  { level: 'create', difficulty: 'hard', label: 'Create', desc: 'Synthesize algorithms & novel policies' },
]

const COUNT_PRESETS = [1, 3, 5, 8, 10]

export function TargetedStudyPanel() {
  const navigate = useNavigate()
  const { userId } = useAuth()

  let topicsQuery = { data: [], isSuccess: false }
  let documentsQuery = { data: [], isSuccess: false }
  try {
    if (typeof docHooks.useDocumentTopics === 'function') {
      topicsQuery = docHooks.useDocumentTopics()
    }
  } catch {
    // fallback
  }
  try {
    if (typeof docHooks.useDocuments === 'function') {
      documentsQuery = docHooks.useDocuments()
    }
  } catch {
    // fallback
  }

  const { data: courses = [] } = usePracticeData(contentCourseIds())

  const [topic, setTopic] = useState('')
  const [bloom, setBloom] = useState('apply')
  const [count, setCount] = useState(5)
  const [uploadedOnly, setUploadedOnly] = useState(false)

  const rows = topicsQuery.data ?? []
  const docs = documentsQuery.data ?? []
  const hasDocuments = documentsQuery.isSuccess && docs.length > 0

  const documentTopics = useMemo(() => rows.flatMap((row) => row.topics ?? []), [rows])

  const candidates = useMemo(() => {
    const library = createRegistry(courses)
    const conceptTitles = library.allConcepts().map((concept) => concept.title)
    return topicSuggestions({ documentTopics, conceptTitles })
  }, [courses, documentTopics])

  const shownSuggestions = useMemo(() => matchingSuggestions(topic, candidates), [topic, candidates])

  const selectedBloomObj = BLOOM_OPTIONS.find((b) => b.level === bloom) || BLOOM_OPTIONS[2]

  const handleStartStudy = (event) => {
    event?.preventDefault()
    const trimmed = topic.trim()
    if (!trimmed) return

    const matchedSubject = subjectForTopic(trimmed, rows)
    const subject = hasDocuments && matchedSubject && matchedSubject !== GENERAL_SUBJECT
      ? matchedSubject
      : null

    const session = newSession({
      scope: 'targeted',
      mode: 'study',
      subject,
      topic: trimmed,
      label: `${trimmed} (${selectedBloomObj.label})`,
      bloom_level: selectedBloomObj.level,
      difficulty: selectedBloomObj.difficulty,
      target_count: count,
      uploadedOnly,
      adaptive: false,
      questions: [],
    })

    saveSession(userId, session)
    holdDraft(session)
    navigate(`/practice/${session.id}`)
  }

  return (
    <div className="space-y-4" data-testid="targeted-study-panel">
      <PanelLarge className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

        <div className="flex items-center gap-2.5 mb-1">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          <h2 className="text-base font-semibold text-ink">Targeted Study Mode</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            Independent
          </span>
        </div>
        <p className="max-w-2xl text-xs md:text-sm text-muted">
          Focus your practice on a specific cognitive level. Choose the depth and question volume you want.
          Questions are streamed asynchronously so you can start immediately without waiting.
        </p>

        <form className="mt-6 space-y-6" onSubmit={handleStartStudy}>
          {/* Topic Input */}
          <div className="max-w-xl">
            <Input
              id="study-topic"
              label="Topic"
              placeholder="For example: Dijkstra, B-Trees, or TCP Congestion Control"
              value={topic}
              autoComplete="off"
              onChange={(event) => setTopic(event.target.value)}
              className="text-base"
            />

            {shownSuggestions.length > 0 && (
              <ul aria-label="Topic suggestions" className="mt-3 flex flex-wrap gap-2">
                {shownSuggestions.map((value) => (
                  <li key={value}>
                    <button
                      type="button"
                      onClick={() => setTopic(value)}
                      className="rounded-full border border-line bg-surface/90 px-3 py-1.5 text-xs font-medium text-muted transition-all duration-150 hover:text-ink hover:border-primary/50 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {value}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bloom Taxonomy Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">
              Select Cognitive Level (Bloom Taxonomy)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-3xl">
              {BLOOM_OPTIONS.map((opt) => {
                const isSelected = bloom === opt.level
                return (
                  <button
                    key={opt.level}
                    type="button"
                    onClick={() => setBloom(opt.level)}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-150 ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm'
                        : 'border-line bg-surface/80 hover:border-line-strong hover:bg-surface-raised'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-ink'}`}>
                        {opt.label}
                      </span>
                      <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                        opt.difficulty === 'easy'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : opt.difficulty === 'medium'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {opt.difficulty}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted line-clamp-2 leading-snug">
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Question Count Selector (Max 10) */}
          <div className="max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Number of Questions (Max 10)
              </label>
              <span className="font-bold text-sm text-primary tabular-nums">
                {count} {count === 1 ? 'question' : 'questions'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {COUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCount(preset)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    count === preset
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {preset} Q
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Pipelined streaming: Question 1 loads immediately, questions 2–{count} prefetch in the background while you solve Q1.
            </p>
          </div>

          {/* Uploaded Notes Toggle */}
          {hasDocuments && (
            <div className="pt-1">
              <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="study-use-uploaded-notes"
                  checked={uploadedOnly}
                  onChange={(event) => setUploadedOnly(event.target.checked)}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="font-medium">Use only my uploaded notes</span>
              </label>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="pt-2 flex items-center gap-3.5">
            <Button
              type="submit"
              disabled={!topic.trim()}
              size="lg"
              className="px-6 text-sm"
              icon={<IconArrowRight size={16} />}
            >
              Start targeted study ({count} Q)
            </Button>
            {!topic.trim() && (
              <p className="text-xs text-muted">Type or select a topic to begin.</p>
            )}
          </div>
        </form>
      </PanelLarge>
    </div>
  )
}

export default TargetedStudyPanel
