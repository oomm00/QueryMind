/**
 * CoursePracticeTab — /course/:id (the index tab).
 *
 * Practice comes first, so this is the tab the course opens on. It shows the
 * topics in course order, each one expanding to its concepts, and every row can
 * start a session on exactly what it names — no setup form in between.
 *
 * The count line ("4 concepts · 24 questions") and the status lines are read
 * from the content and from scored answers, so a topic that has not been
 * practised says "No estimate" and a row with nothing to ask is disabled. Study
 * material is not here on purpose: it is the next tab.
 */

import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { sentenceCase } from '../../lib/text'
import { statusFor, statusLine, toneClass } from '../../components/map/conceptStatus.js'
import { PanelLarge } from '../../components/ui/Panel'
import { LevelControl } from '../../components/practice/LevelControl.jsx'
import { StartPracticeButton } from '../../components/practice/StartPracticeButton.jsx'
import { IconChevronDown } from '../../components/ui/Icons'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** The mean of the concept estimates a topic actually has, or null. */
function topicEstimate(topic, estimates) {
  const values = topic.concepts
    .map((concept) => estimates[concept.id])
    .filter((value) => typeof value === 'number')
  if (values.length === 0) return null
  return {
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
    basedOn: values.length,
    of: topic.concepts.length,
  }
}

function ConceptRow({ courseId, concept, estimates, level }) {
  const estimate = estimates[concept.id]
  const status = statusFor(estimate)
  const StatusIcon = status.icon
  const count = concept.questions.length

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 pl-6">
      <div className="min-w-0">
        <h4 className="text-[13px] font-medium text-ink">{sentenceCase(concept.title)}</h4>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <StatusIcon size={13} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
          {statusLine(typeof estimate === 'number' ? estimate : null)}
        </p>
      </div>

      <StartPracticeButton
        courseId={courseId}
        scope="concept"
        scopeId={concept.id}
        level={level}
        variant="secondary"
        size="sm"
        label="Practice"
        count={count > 0 ? Math.min(6, count) : 6}
      />
    </li>
  )
}

function TopicRow({ courseId, topic, estimates, level, expanded, onToggle }) {
  const conceptCount = topic.concepts.length
  const questionCount = topic.concepts.reduce(
    (sum, concept) => sum + concept.questions.length,
    0
  )
  const rollUp = topicEstimate(topic, estimates)
  const status = statusFor(rollUp?.value ?? null)
  const StatusIcon = status.icon

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <IconChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 text-muted transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
            />
            <h3 className="text-sm font-semibold text-ink">{sentenceCase(topic.title)}</h3>
          </button>
          <p className="mt-0.5 pl-6 text-xs tabular-nums text-muted">
            {plural(conceptCount, 'concept')} · {plural(questionCount, 'question')}
          </p>
          <p className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-muted">
            <StatusIcon size={14} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
            {rollUp ? statusLine(rollUp.value) : 'No estimate'}
          </p>
        </div>

        <StartPracticeButton
          courseId={courseId}
          scope="topic"
          scopeId={topic.id}
          level={level}
          size="sm"
          label="Practice"
          count={questionCount > 0 ? Math.min(6, questionCount) : 6}
        />
      </div>

      {expanded && conceptCount > 0 && (
        <ol className="mt-2 divide-y divide-line border-t border-line">
          {topic.concepts.map((concept) => (
            <ConceptRow
              key={concept.id}
              courseId={courseId}
              concept={concept}
              estimates={estimates}
              level={level}
            />
          ))}
        </ol>
      )}
    </li>
  )
}

export default function CoursePracticeTab() {
  const { courseId, topics, estimates, level, setLevel } = useOutletContext()
  const [expanded, setExpanded] = useState({})

  const toggle = (topicId) =>
    setExpanded((current) => ({ ...current, [topicId]: !current[topicId] }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Practise this course</h2>
          <p className="mt-0.5 text-xs text-muted">
            Pick a level, then practise a topic or a single concept.
          </p>
        </div>
        <LevelControl value={level} onChange={setLevel} />
      </div>

      <PanelLarge>
        <ol className="divide-y divide-line">
          {topics.map((topic) => (
            <TopicRow
              key={topic.id}
              courseId={courseId}
              topic={topic}
              estimates={estimates}
              level={level}
              expanded={Boolean(expanded[topic.id])}
              onToggle={() => toggle(topic.id)}
            />
          ))}
        </ol>
      </PanelLarge>
    </div>
  )
}
