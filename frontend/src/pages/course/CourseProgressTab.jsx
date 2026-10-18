/**
 * CourseProgressTab — /course/:id/progress.
 *
 * Every figure here is derived from scored answers: how many concepts have been
 * practised, how many answers produced them, the estimated mastery and the
 * confidence behind it, the same estimate split by Bloom level, and per topic.
 * A concept with nothing answered has no estimate, so it counts towards the
 * coverage denominator but never towards a mastery average - which is why each
 * topic says how many of its concepts the number is based on.
 *
 * Nothing on the tab is invented. With no answers at all it shows zeros and the
 * words "No estimate" rather than a placeholder percentage.
 */

import React from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProgress } from '../../lib/masteryStore.js'
import { estimatesFrom, rollUp } from '../../lib/mastery.js'
import {
  confidenceLine,
  rollUpLine,
  statusFor,
  statusLine,
  toneClass,
} from '../../components/map/conceptStatus.js'
import { PanelLarge } from '../../components/ui/Panel'
import { ProgressLine } from '../../components/ui/ProgressLine'
import { BloomChip } from '../../components/practice/BloomChip.jsx'
import { BLOOM_LEVELS } from '../../constants/bloomTaxonomy.js'
import { sentenceCase } from '../../lib/text'

function percent(value) {
  return value == null ? null : `${Math.round(value * 100)}%`
}

/** Estimated mastery at each Bloom level, over the course's concepts. */
function bloomBreakdown(concepts, conceptIds) {
  return BLOOM_LEVELS.map((level) => {
    const values = []
    let answers = 0
    for (const conceptId of conceptIds) {
      const entry = concepts?.[conceptId]?.[level.value]
      if (entry && typeof entry.value === 'number') {
        values.push(entry.value)
        answers += Number(entry.count) || 0
      }
    }
    return {
      ...level,
      mastery: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      concepts: values.length,
      answers,
    }
  })
}

function Stat({ label, value, hint, children }) {
  return (
    <div className="rounded-panel border border-line bg-surface-raised p-4">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      {children}
    </div>
  )
}

export default function CourseProgressTab() {
  const { userId, topics } = useOutletContext()
  const progress = useProgress(userId)

  const concepts = progress.concepts ?? {}
  const allConcepts = topics.flatMap((topic) => topic.concepts)
  const conceptIds = allConcepts.map((concept) => concept.id)
  const estimatesById = estimatesFrom(concepts)

  const practised = allConcepts.filter((concept) => concepts[concept.id]).length
  const coverage = allConcepts.length > 0 ? practised / allConcepts.length : null
  const answersGiven = Object.values(concepts).reduce(
    (sum, entry) =>
      sum + Object.values(entry ?? {}).reduce((inner, item) => inner + (Number(item.count) || 0), 0),
    0
  )

  const courseRollUp = rollUp(estimatesById, conceptIds)
  const byBloom = bloomBreakdown(concepts, conceptIds)

  return (
    <div className="space-y-4">
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Practice coverage</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Concepts practiced"
            value={`${practised} of ${allConcepts.length}`}
            hint="A concept counts once it has any scored answer."
          >
            <ProgressLine className="mt-2" percentage={coverage == null ? 0 : coverage * 100} />
          </Stat>
          <Stat
            label="Answers given"
            value={answersGiven}
            hint="Every scored answer, mcq or marked short."
          />
          <Stat
            label="Estimated mastery"
            value={courseRollUp ? percent(courseRollUp.value) : 'No estimate'}
            hint={rollUpLine(courseRollUp)}
          >
            <p className="mt-2 text-[11px] text-muted">{confidenceLine(courseRollUp)}</p>
          </Stat>
        </div>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">By Bloom level</h2>
        <p className="mt-0.5 text-xs text-muted">
          The same estimate, split by the kind of thinking each question asked for.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {byBloom.map((level) => (
            <li key={level.value} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <BloomChip bloom={level.value} className="w-32 shrink-0 justify-between" />
              <div className="min-w-[120px] flex-1">
                <ProgressLine percentage={level.mastery == null ? 0 : level.mastery * 100} />
              </div>
              <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-ink">
                {level.mastery == null ? 'No estimate' : percent(level.mastery)}
              </span>
              <span className="w-28 shrink-0 text-right text-[11px] text-muted">
                {level.answers} answer{level.answers === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Per topic</h2>
        <ul className="mt-3 divide-y divide-line">
          {topics.map((topic) => {
            const topicIds = topic.concepts.map((concept) => concept.id)
            const topicRollUp = rollUp(estimatesById, topicIds)
            const status = statusFor(topicRollUp?.value ?? null)
            const StatusIcon = status.icon
            return (
              <li key={topic.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-medium text-ink">{sentenceCase(topic.title)}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <StatusIcon size={13} aria-hidden="true" className={`shrink-0 ${toneClass(status.tone)}`} />
                    {topicRollUp ? statusLine(topicRollUp.value) : 'No estimate'}
                  </p>
                </div>
                <span className="text-[11px] text-muted">
                  {topicRollUp
                    ? `based on ${topicRollUp.basedOn} of ${topicRollUp.of} concepts`
                    : `based on 0 of ${topicIds.length} concepts`}
                </span>
              </li>
            )
          })}
        </ul>
      </PanelLarge>
    </div>
  )
}
