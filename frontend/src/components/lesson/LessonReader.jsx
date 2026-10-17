/**
 * LessonReader — the centre column of the lesson workspace.
 *
 * Breadcrumb label, title, position line, source tag, objectives, the rendered
 * blocks, and previous/next navigation. Below md the navigation moves into a
 * sticky bottom bar so it stays reachable with one thumb; it sits above the
 * shell's mobile tab bar (56px) rather than on top of it.
 *
 * A lesson that has not been written yet renders a calm placeholder state, not
 * an error — the outline can legitimately point at unwritten lessons.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button, buttonClasses } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconMenu,
  IconNotes,
  IconTarget,
} from '../ui/Icons'
import { BlockRenderer } from './BlockRenderer'
import { sentenceCase } from '../../lib/text'
import { completeLesson, useLessonProgress } from '../../content/lessonProgress.js'
import { isPlaceholderLesson } from '../../content/os/index.js'

function NavButton({ target, direction }) {
  const Icon = direction === 'prev' ? IconArrowLeft : IconArrowRight

  if (!target) return <span aria-hidden="true" />

  return (
    <Link
      to={target.to}
      className={buttonClasses({ variant: 'secondary', size: 'md', className: 'min-w-0' })}
    >
      {direction === 'prev' && <Icon size={16} className="shrink-0" />}
      <span className="truncate">{target.title}</span>
      {direction === 'next' && <Icon size={16} className="shrink-0" />}
    </Link>
  )
}

export function LessonReader({
  topic,
  concept,
  lesson,
  position,
  prev,
  next,
  outlineOpen,
  intelOpen,
  onOpenOutline,
  onOpenIntel,
}) {
  const progress = useLessonProgress()
  const placeholder = isPlaceholderLesson(lesson)
  const reviewed = Boolean(progress.completed[lesson.id])

  const meta = [
    position?.total > 1 ? `Lesson ${position.index + 1} of ${position.total}` : null,
    lesson.estMinutes ? `${lesson.estMinutes} min read` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const crumb = [topic?.title, concept?.title].filter(Boolean).map(sentenceCase).join(' / ')

  return (
    <div className="min-w-0 flex-1 space-y-6">
      {/* Panel toggles: below lg these open drawers, at lg+ they reopen a
          collapsed column. Either way, a hidden panel is one click away. */}
      {(!outlineOpen || !intelOpen) && (
        <div className="flex items-center gap-2">
          {!outlineOpen && (
            <Button
              variant="secondary"
              size="sm"
              icon={<IconMenu size={15} />}
              onClick={onOpenOutline}
            >
              Outline
            </Button>
          )}
          {!intelOpen && (
            <Button
              variant="secondary"
              size="sm"
              icon={<IconTarget size={15} />}
              onClick={onOpenIntel}
            >
              Intelligence
            </Button>
          )}
        </div>
      )}

      <header className="space-y-2">
        {/* The written lesson is optional study material on an assessment
            platform, so the workspace says what it is. */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Study notes</p>
        {crumb && (
          <p className="text-[11px] font-medium text-muted">{crumb}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{lesson.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {meta && <span>{meta}</span>}
          {meta && <span aria-hidden="true">·</span>}
          <Badge tone="neutral" label={lesson.source || 'Official material'} />
        </div>
      </header>

      {!placeholder && lesson.objectives?.length > 0 && (
        <Panel className="max-w-[68ch] p-4">
          <p className="text-sm font-semibold text-ink">Objectives</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
            {lesson.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </Panel>
      )}

      {placeholder ? (
        <EmptyState
          icon={IconNotes}
          title="This lesson is not written yet"
          description="The outline knows about this lesson, but its content has not been written. Nothing is broken — continue to the next lesson to keep going."
          className="rounded-panel border border-line bg-surface-raised"
        />
      ) : (
        <BlockRenderer blocks={lesson.blocks} lessonId={lesson.id} />
      )}

      {!placeholder && (
        <Panel className="max-w-[68ch] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Mark as reviewed</p>
              <p className="text-[11px] text-muted">Updates completion only, not mastery</p>
            </div>
            <Button
              variant={reviewed ? 'secondary' : 'primary'}
              size="sm"
              icon={reviewed ? <IconCheck size={15} /> : null}
              disabled={reviewed}
              onClick={() => completeLesson(lesson.id)}
            >
              {reviewed ? 'Reviewed' : 'Mark as reviewed'}
            </Button>
          </div>
        </Panel>
      )}

      <nav
        aria-label="Lesson navigation"
        className="hidden max-w-[68ch] items-center justify-between gap-3 border-t border-line pt-4 md:flex"
      >
        <NavButton target={prev} direction="prev" />
        {position?.total > 1 && (
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {position.index + 1} / {position.total}
          </span>
        )}
        <NavButton target={next} direction="next" />
      </nav>

      {/* Sticky bar below md. bottom-14 clears the shell's mobile tab bar. */}
      <div className="sticky bottom-14 z-20 -mx-6 flex items-center justify-between gap-2 border-t border-line bg-surface px-6 py-3 md:hidden">
        <NavButton target={prev} direction="prev" />
        <NavButton target={next} direction="next" />
      </div>
    </div>
  )
}

export default LessonReader
