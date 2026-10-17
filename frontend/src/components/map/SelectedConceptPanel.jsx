/**
 * SelectedConceptPanel — the "Selected concept" column beside the graph.
 *
 * Only two figures here are measured: estimated mastery and the most recent
 * assessment, both from the lessonProgress store for this browser session.
 * Everything the data cannot support reads as "No mastery estimate" or "—"
 * rather than an invented number, and the panel says which of the two it is
 * showing, because mastery and completion are separate concerns: finishing a
 * lesson never moves mastery, only answered checks do.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button, buttonClasses } from '../ui/Button'
import { IconArrowRight } from '../ui/Icons'
import { getLessonMastery, useLessonProgress } from '../../content/lessonProgress.js'
import { practiceLink } from '../../lib/practiceLink'
import { sentenceCase } from '../../lib/text'
import { badgeTone, statusFor, toneClass } from './conceptStatus'

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
  mastery = null,
  masteryById = {},
  onSelect,
  className,
}) {
  const progress = useLessonProgress()

  const lessons = concept?.lessons ?? []
  const status = statusFor(mastery)
  const StatusIcon = status.icon
  const percent = mastery == null || Number.isNaN(mastery) ? null : Math.round(mastery * 100)

  // The newest answered check in this concept is the "recent assessment"; the
  // timestamp is the lesson's own completion time, which is all we record.
  const assessed = lessons
    .map((lesson) => ({ lesson, mastery: getLessonMastery(lesson.id) }))
    .filter((row) => row.mastery !== null)
  const recent =
    [...assessed].sort((a, b) =>
      String(progress.completed[b.lesson.id] ?? '').localeCompare(
        String(progress.completed[a.lesson.id] ?? '')
      )
    )[0] ?? null

  const prerequisites = (concept?.prerequisites ?? []).map((item) => ({
    ...item,
    mastery: masteryById[item.id] ?? null,
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

  const nextLesson = lessons.find((lesson) => !lesson.isPlaceholder) ?? null

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
              value={percent == null ? 'No mastery estimate' : `${percent}%`}
              hint={
                percent == null
                  ? 'No checks answered in this concept yet'
                  : 'Share of answered checks that were correct'
              }
            />
            <Row
              label="Recent assessment"
              value={recent ? `${Math.round(recent.mastery * 100)}% correct` : '—'}
              hint={
                recent
                  ? `${sentenceCase(recent.lesson.title)}${
                      formatWhen(progress.completed[recent.lesson.id])
                        ? ` · ${formatWhen(progress.completed[recent.lesson.id])}`
                        : ''
                    }`
                  : 'Nothing assessed in this session'
              }
            />
            <Row
              label="Retention / recall"
              value="—"
              hint="Needs spaced-review history, not connected yet"
            />
          </div>

          <div className="mt-4 space-y-4">
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
                          {masteryById[item.id] == null
                            ? 'no estimate'
                            : `${Math.round(masteryById[item.id] * 100)}%`}
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
              <div className="space-y-2">
                {nextLesson ? (
                  <Link
                    to={`/learn/${courseId}/${topicId}/${nextLesson.id}`}
                    className={buttonClasses({ size: 'sm', className: 'w-full' })}
                  >
                    Continue {sentenceCase(concept.title)} lesson
                  </Link>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled
                      icon={<IconArrowRight size={14} />}
                    >
                      Continue {sentenceCase(concept.title)} lesson
                    </Button>
                    <p className="text-[11px] leading-snug text-muted">
                      This concept&apos;s lessons are not written yet.
                    </p>
                  </>
                )}

                <Link
                  to={practiceLink({ topic: sentenceCase(concept.title), count: 5 })}
                  className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
                >
                  Start 5-question check
                </Link>
              </div>
            </Section>
          </div>

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
            Mastery is the share of checks answered correctly in this session — marking a lesson as
            reviewed never changes it. A concept whose lessons are still to be written stays at no
            estimate.
          </p>
        </>
      )}
    </Panel>
  )
}

export default SelectedConceptPanel
