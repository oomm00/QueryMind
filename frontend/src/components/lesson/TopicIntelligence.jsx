/**
 * TopicIntelligence — the right column of the lesson workspace.
 *
 * Estimated mastery is the only measured figure, and it comes from the answers
 * given in practice (lib/mastery.js), with the evidence behind it stated. Review
 * progress is kept separate and labelled as such. Everything the data cannot
 * support is shown as "No estimate" or "—" rather than invented, and each derived
 * row states the rule it uses in its hint.
 */

import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { ProgressRing } from '../ui/ProgressRing'
import { buttonClasses } from '../ui/Button'
import { IconArrowRight, IconTarget } from '../ui/Icons'
import { useLessonProgress } from '../../content/lessonProgress.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useMastery } from '../../lib/masteryStore.js'
import { StartPracticeButton } from '../practice/StartPracticeButton.jsx'
import { confidenceLine } from '../map/conceptStatus'
import { sentenceCase } from '../../lib/text'

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

function percent(value) {
  return value == null ? null : `${Math.round(value * 100)}%`
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

export function TopicIntelligence({ courseId, topicId, topic, concept, onNavigate }) {
  const progress = useLessonProgress()
  const { userId } = useAuth()
  const estimates = useMastery(userId)

  const lessons = concept?.lessons ?? []
  const estimate = concept ? estimates[concept.id] ?? null : null
  const mastery = estimate?.value ?? null
  const answers = Number(estimate?.count) || 0
  const bloomLevels = estimate?.bloomCount ?? 0

  const reviewedAt = lessons
    .map((lesson) => progress.completed[lesson.id])
    .filter(Boolean)
    .sort()
    .pop()

  const concepts = useMemo(() => topic?.concepts ?? [], [topic])

  // Weakest concept in the topic that has actually been practised.
  const weakest = useMemo(() => {
    return concepts
      .map((item) => ({
        id: item.id,
        title: item.title,
        mastery: estimates[item.id]?.value ?? null,
      }))
      .filter((item) => item.mastery !== null)
      .sort((a, b) => a.mastery - b.mastery)[0]
  }, [concepts, estimates])

  const issue =
    weakest && weakest.mastery < 0.6
      ? `${sentenceCase(weakest.title)} is at ${percent(weakest.mastery)} — worth reviewing before you move on.`
      : null

  // Recommend the next lesson that has not been marked reviewed, staying in the
  // concept first and then moving to the next concept of the same topic.
  const recommendation = useMemo(() => {
    const open = lessons.filter((lesson) => !lesson.isPlaceholder && !progress.completed[lesson.id])
    if (open.length > 0) {
      return { id: open[0].id, title: open[0].title, reason: 'Not marked reviewed yet' }
    }
    if (lessons.length > 0 && lessons.every((lesson) => lesson.isPlaceholder)) return null

    const index = concepts.findIndex((item) => item.id === concept?.id)
    const next = concepts[index + 1]
    const nextLesson = next?.lessons.find((lesson) => !lesson.isPlaceholder)
    if (nextLesson) {
      return { id: nextLesson.id, title: nextLesson.title, reason: `Starts ${sentenceCase(next.title)}` }
    }
    return null
  }, [lessons, concepts, concept, progress])

  const related = concepts.filter((item) => item.id !== concept?.id).slice(0, 4)
  const masteryPct = mastery == null ? null : Math.round(mastery * 100)

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2">
        <IconTarget size={15} className="text-muted" />
        <h2 className="text-sm font-semibold text-ink">Topic intelligence</h2>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        Estimates for this concept, from the answers given in practice.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <ProgressRing
          value={masteryPct ?? 0}
          size={64}
          stroke={6}
          label={masteryPct == null ? '—' : `${masteryPct}%`}
        />
        <div className="min-w-0">
          <p className="text-xs text-muted">Estimated mastery</p>
          <p className="text-sm font-medium text-ink">
            {masteryPct == null ? 'No estimate yet' : `${masteryPct}% estimated mastery`}
          </p>
          <p className="text-[11px] leading-snug text-muted">
            {masteryPct == null
              ? 'Answer a question in practice to start one.'
              : 'Separate from completion — only scored answers move this.'}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Row
          label="Confidence"
          value={estimate?.confidence?.label ?? 'None yet'}
          hint={confidenceLine(estimate)}
        />
        <Row
          label="Answers recorded"
          value={answers > 0 ? String(answers) : '—'}
          hint={
            answers > 0
              ? `Across ${bloomLevels} Bloom level${bloomLevels === 1 ? '' : 's'}`
              : 'Nothing answered in practice yet'
          }
        />
        <Row
          label="Last note reviewed"
          value={reviewedAt ? formatWhen(reviewedAt) : '—'}
          hint={reviewedAt ? 'Completion, not mastery' : 'Nothing reviewed in this session'}
        />
        <Row
          label="Retention / recall"
          value="—"
          hint="Needs spaced-review history, not connected yet"
        />
      </div>

      <StartPracticeButton
        courseId={courseId}
        scope="concept"
        scopeId={concept?.id}
        label="Practice this concept"
        size="sm"
        fullWidth
        className="mt-4"
      />

      <div className="mt-4 space-y-4">
        <Section title="Prerequisites">
          {concept?.prerequisites?.length ? (
            <ul className="space-y-1">
              {concept.prerequisites.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/map/${courseId}/${item.topicId}`}
                    onClick={onNavigate}
                    className="text-[13px] text-primary hover:underline"
                  >
                    {sentenceCase(item.title)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">None — this concept starts the topic.</p>
          )}
        </Section>

        <Section title="Related concepts">
          {related.length ? (
            <ul className="space-y-1">
              {related.map((item) => {
                const target = item.lessons.find((lesson) => !lesson.isPlaceholder) ?? item.lessons[0]
                if (!target) {
                  return (
                    <li key={item.id} className="text-[13px] text-muted">
                      {sentenceCase(item.title)}
                    </li>
                  )
                }
                return (
                  <li key={item.id}>
                    <Link
                      to={`/learn/${courseId}/${topicId}/${target.id}`}
                      onClick={onNavigate}
                      className="text-[13px] text-primary hover:underline"
                    >
                      {sentenceCase(item.title)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">This is the only concept in the topic.</p>
          )}
        </Section>

        <Section title="Possible issue">
          {issue ? (
            <p className="text-[13px] leading-relaxed text-warning">{issue}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              {weakest ? 'Nothing stands out yet.' : 'Not enough evidence to tell yet.'}
            </p>
          )}
        </Section>

        <Section title="Recommended next action">
          {recommendation ? (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-ink">{recommendation.title}</p>
              <p className="text-[11px] text-muted">{recommendation.reason}</p>
              <Link
                to={`/learn/${courseId}/${topicId}/${recommendation.id}`}
                onClick={onNavigate}
                className={buttonClasses({ size: 'sm', className: 'w-full' })}
              >
                Continue
                <IconArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-muted">
                {lessons.length === 0
                  ? 'No lessons to work on yet.'
                  : 'Everything in this concept is reviewed.'}
              </p>
              <Badge tone="success" label="Concept complete" />
            </div>
          )}
        </Section>
      </div>
    </Panel>
  )
}

export default TopicIntelligence
