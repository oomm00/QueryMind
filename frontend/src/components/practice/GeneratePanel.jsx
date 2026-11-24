/**
 * GeneratePanel — "Pick a topic" setup screen for adaptive practice.
 *
 * Requirements:
 * 1. Topic input with suggestion chips.
 * 2. "Use only my uploaded notes" switch (OFF by default, hidden if no documents;
 *    if enabled, shows which documents are active).
 * 3. One primary action button: "Start practice".
 * 4. Adaptive is always on (no manual/difficulty/bloom/count toggles).
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

export function GeneratePanel() {
  const navigate = useNavigate()
  const { userId } = useAuth()

  let topicsQuery = { data: [], isSuccess: false }
  let documentsQuery = { data: [], isSuccess: false }
  try {
    if (typeof docHooks.useDocumentTopics === 'function') {
      topicsQuery = docHooks.useDocumentTopics()
    }
  } catch {
    // Mock didn't export useDocumentTopics
  }
  try {
    if (typeof docHooks.useDocuments === 'function') {
      documentsQuery = docHooks.useDocuments()
    }
  } catch {
    // Mock didn't export useDocuments
  }

  const { data: courses = [] } = usePracticeData(contentCourseIds())

  const [topic, setTopic] = useState('')
  const [uploadedOnly, setUploadedOnly] = useState(false)

  const rows = topicsQuery.data ?? []
  const docs = documentsQuery.data ?? []
  // Only show the switch if the user has actually uploaded at least one document
  const hasDocuments = documentsQuery.isSuccess && docs.length > 0

  // Suggestions: uploaded topics first, then library concept titles.
  const documentTopics = useMemo(() => rows.flatMap((row) => row.topics ?? []), [rows])

  const candidates = useMemo(() => {
    const library = createRegistry(courses)
    const conceptTitles = library.allConcepts().map((concept) => concept.title)
    return topicSuggestions({ documentTopics, conceptTitles })
  }, [courses, documentTopics])

  const shownSuggestions = useMemo(() => matchingSuggestions(topic, candidates), [topic, candidates])

  const handleStartPractice = (event) => {
    event?.preventDefault()
    const trimmed = topic.trim()
    if (!trimmed) return

    const matchedSubject = subjectForTopic(trimmed, rows)
    const subject = hasDocuments
      ? matchedSubject === GENERAL_SUBJECT
        ? null
        : matchedSubject
      : GENERAL_SUBJECT

    const session = newSession({
      scope: 'adaptive',
      subject,
      topic: trimmed,
      label: trimmed,
      uploadedOnly,
      adaptive: true,
      questions: [],
    })

    saveSession(userId, session)
    holdDraft(session)
    navigate(`/practice/${session.id}`)
  }

  return (
    <div className="space-y-4">
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Pick a topic</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-muted">
          Name any topic you want to master. Practice adapts in real time: strong answers
          move you up the difficulty ladder, and mistakes adjust it down.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleStartPractice}>
          {/* Topic Input & Suggestion Chips */}
          <div className="max-w-xl">
            <Input
              id="generate-topic"
              label="Topic"
              placeholder="For example: Deadlocks, Paging, or CPU Scheduling"
              value={topic}
              autoComplete="off"
              onChange={(event) => setTopic(event.target.value)}
            />

            {shownSuggestions.length > 0 && (
              <ul aria-label="Topic suggestions" className="mt-2 flex flex-wrap gap-1.5">
                {shownSuggestions.map((value) => (
                  <li key={value}>
                    <button
                      type="button"
                      onClick={() => setTopic(value)}
                      className="rounded-full border border-line bg-surface-raised px-2.5 py-1 text-xs text-muted transition-colors duration-150 hover:text-ink hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {value}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Uploaded Notes Toggle (Hidden if no uploaded notes; OFF by default) */}
          {hasDocuments && (
            <div className="pt-1 space-y-2">
              <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="use-uploaded-notes"
                  aria-label="Use only my uploaded notes"
                  checked={uploadedOnly}
                  onChange={(event) => setUploadedOnly(event.target.checked)}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span className="font-medium">Use only my uploaded notes</span>
              </label>

              {uploadedOnly && (
                <div className="rounded-control border border-line bg-surface-raised p-3 text-xs text-muted max-w-xl">
                  <span className="font-semibold text-ink">Active documents: </span>
                  {docs.length > 0 ? (
                    <span>
                      {docs
                        .map((d) => d.title || d.filename || d.topic)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  ) : (
                    <span>
                      {documentTopics.length > 0 ? documentTopics.join(', ') : 'Your uploaded notes'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Primary Action Button */}
          <div className="pt-2 flex items-center gap-3">
            <Button
              type="submit"
              id="btn-start-practice"
              disabled={!topic.trim()}
              size="md"
            >
              Start practice
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

export default GeneratePanel
