/**
 * SelectedConceptPanel — the "Selected concept" column beside the graph.
 *
 * The one figure that is measured here is estimated mastery, and it comes from
 * the answers the student has given in practice (lib/mastery.js): the mean of
 * the concept's Bloom levels with scored answers. Everything the data cannot
 * support reads as "No estimate" or "—" rather than an invented number, and the
 * panel says how much evidence is behind the figure, because mastery and
 * completion are separate concerns: reading a study note never moves mastery.
 *
 * Study material sits at the bottom, after the next steps: it is optional
 * reading, and a concept with no links says so instead of looking broken.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { sentenceCase } from '../../lib/text'
import { badgeTone, confidenceLine, statusFor, toneClass } from './conceptStatus'
import { ConceptActions } from './ConceptActions'
import { ConceptMiniMap } from './ConceptMiniMap'
import { StudyMaterial } from '../content/StudyMaterial'

function formatWhen(iso) {
  if (!iso) return null
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span className="block text-sm font-medium text-ink">{value}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

export function SelectedConceptPanel({
  courseId,
  topicId,
  topic,
  concept,
  estimate = null,
  estimatesById = {},
  onSelect,
  className,
}) {
  const mastery = estimate?.value ?? null
  const status = statusFor(mastery)
  const StatusIcon = status.icon
  const percent = mastery == null || Number.isNaN(mastery) ? null : Math.round(mastery * 100)

  // How many answers, and when the last one landed: the evidence behind the
  // figure, kept next to it so a percentage is never read as more than it is.
  const answers = Number(estimate?.count) || 0
  const answeredAt = estimate?.updatedAt ? formatWhen(estimate.updatedAt) : null
  const bloomLevels = estimate?.bloomCount ?? 0

  const prerequisites = (concept?.prerequisites ?? []).map((item) => ({
    ...item,
    mastery: estimatesById[item.id]?.value ?? null,
  }))

  const related = (topic?.concepts ?? []).filter(
    (item) => item.id !== concept?.id && !(concept?.prerequisites ?? []).some((p) => p.id === item.id)
  )

  // A prerequisite below the "learning" band is the likeliest blocker.
  const weakPrerequisite = prerequisites
    .filter((item) => item.mastery !== null && item.mastery < 0.6)
    .sort((a, b) => a.mastery - b.mastery)[0]

  const issue = weakPrerequisite
    ? `${sentenceCase(weakPrerequisite.title)} is at ${Math.round(
        weakPrerequisite.mastery * 100
      )}% — worth revising before you continue.`
    : percent != null && percent < 60
      ? `${sentenceCase(concept.title)} is at ${percent}% — worth revising before you move on.`
      : null

  return (
    <Panel className={`p-4 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Selected concept</h2>
        {concept && <Badge tone={badgeTone(status.tone)} label={status.label} />}
      </div>

      {!concept ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Select a concept to see its mastery, the concepts it depends on and the next thing to do.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <StatusIcon size={15} className={`shrink-0 ${toneClass(status.tone)}`} />
            {sentenceCase(concept.title)}
          </p>
          {concept.summary && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{concept.summary}</p>
          )}

          <div className="mt-3">
            <Row
              label="Estimated mastery"
              value={percent == null ? 'No estimate' : `${percent}%`}
              hint={percent == null ? 'Nothing answered in practice yet' : confidenceLine(estimate)}
            />
            <Row
              label="Answers recorded"
              value={answers > 0 ? String(answers) : '—'}
              hint={
                answers > 0
                  ? `Across ${bloomLevels} Bloom level${bloomLevels === 1 ? '' : 's'}${
                      answeredAt ? ` · last ${answeredAt}` : ''
                    }`
                  : 'Practice answers are what mastery is built from'
              }
            />
            <Row
              label="Retention / recall"
              value="—"
              hint="Needs spaced-review history, not connected yet"
            />
          </div>

          <div className="mt-4 space-y-4">
            <Section title="Concept map">
              <ConceptMiniMap
                concepts={topic?.concepts ?? []}
                concept={concept}
                estimatesById={estimatesById}
                onSelect={onSelect}
              />
            </Section>

            <Section title="Prerequisites">
              {prerequisites.length ? (
                <ul className="space-y-1.5">
                  {prerequisites.map((item) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0">
                        <Link
                          to={`/map/${courseId}/${item.topicId}`}
                          className="text-[13px] text-primary hover:underline"
                        >
                          {sentenceCase(item.title)}
                        </Link>
                        {item.label && (
                          <span className="ml-1 text-[11px] text-muted">{item.label}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">
                        {item.mastery == null
                          ? 'No estimate'
                          : `${Math.round(item.mastery * 100)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">None — this concept starts the topic.</p>
              )}
            </Section>

            <Section title="Related concepts">
              {related.length ? (
                <ul className="space-y-1.5">
                  {related.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect?.(item.id)}
                        className="text-left text-[13px] text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {sentenceCase(item.title)}
                        <span className="ml-1 text-[11px] text-muted">
                          {estimatesById[item.id]?.value == null
                            ? 'no estimate'
                            : `${Math.round(estimatesById[item.id].value * 100)}%`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No other concepts in this topic yet.</p>
              )}
            </Section>

            <Section title="Possible issue">
              <p
                className={
                  issue
                    ? 'text-[13px] leading-relaxed text-warning'
                    : 'text-[13px] leading-relaxed text-muted'
                }
              >
                {issue ??
                  (percent == null
                    ? 'Not enough evidence to tell yet.'
                    : 'Nothing stands out — mastery is at or above the review band.')}
              </p>
            </Section>

            <Section title="Next steps">
              <ConceptActions courseId={courseId} topicId={topicId} concept={concept} />
            </Section>

            <Section title="Study material (optional)">
              <p className="mb-1.5 text-[11px] leading-snug text-muted">
                Reading for this concept. Nothing here is required to practice it.
              </p>
              <StudyMaterial resources={concept.resources ?? []} />
            </Section>
          </div>

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
            Mastery is estimated from the answers you give in practice, one score per answered
            question — reading a study note never changes it. A concept with nothing answered yet
            has no estimate, and a topic's figure only covers the concepts that have one.
          </p>
        </>
      )}
    </Panel>
  )
}

export default SelectedConceptPanel
