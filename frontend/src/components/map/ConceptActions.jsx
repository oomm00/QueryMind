/**
 * ConceptActions — the two things a concept offers, in one place.
 *
 * The graph's side panel and the list view must offer the same next steps, so
 * both render this: the concept's first written lesson, and a prepared practice
 * check for the concept. A concept whose lessons are still to be written keeps
 * the button (so the shape of the page does not shift) and says why it is off.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonClasses } from '../ui/Button'
import { IconArrowRight } from '../ui/Icons'
import { practiceLink } from '../../lib/practiceLink'
import { sentenceCase } from '../../lib/text'

export function ConceptActions({ courseId, topicId, concept, className }) {
  const title = sentenceCase(concept?.title ?? '')
  const nextLesson = (concept?.lessons ?? []).find((lesson) => !lesson.isPlaceholder) ?? null

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {nextLesson ? (
        <Link
          to={`/learn/${courseId}/${topicId}/${nextLesson.id}`}
          className={buttonClasses({ size: 'sm', className: 'w-full' })}
        >
          Continue {title} lesson
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
            Continue {title} lesson
          </Button>
          <p className="text-[11px] leading-snug text-muted">
            This concept&apos;s lessons are not written yet.
          </p>
        </>
      )}

      <Link
        to={practiceLink({ topic: title, count: 5 })}
        className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
      >
        Start 5-question check
      </Link>
    </div>
  )
}

export default ConceptActions
