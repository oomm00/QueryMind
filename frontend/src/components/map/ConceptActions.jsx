/**
 * ConceptActions — the two things a concept offers, in one place.
 *
 * The graph's side panel and the list view must offer the same next steps, so
 * both render this. Practice comes first and is never gated: a concept with no
 * study material, no written lesson and even no questions yet still leads to the
 * practice session, which is where the app says what it has to ask. Study notes
 * are the secondary route, and a concept whose lessons are not written keeps the
 * button (so the shape of the page does not shift) and says why it is off.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonClasses } from '../ui/Button'
import { practiceLink } from '../../lib/practiceLink'
import { sentenceCase } from '../../lib/text'

export function ConceptActions({ courseId, topicId, concept, className }) {
  const title = sentenceCase(concept?.title ?? '')
  const nextLesson = (concept?.lessons ?? []).find((lesson) => !lesson.isPlaceholder) ?? null
  const questionCount = concept?.questionCount ?? 0

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Link
        to={practiceLink({ topic: topicId, concept: concept?.id, count: 5 })}
        className={buttonClasses({ size: 'sm', className: 'w-full' })}
      >
        Practice this concept
      </Link>
      <p className="text-[11px] leading-snug text-muted">
        {questionCount > 0
          ? `${questionCount} question${questionCount === 1 ? '' : 's'} in this concept's bank.`
          : 'No questions written for this concept yet — the session will say so.'}
      </p>

      {nextLesson ? (
        <Link
          to={`/learn/${courseId}/${topicId}/${nextLesson.id}`}
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
        >
          Study notes: {sentenceCase(nextLesson.title)}
        </Link>
      ) : (
        <>
          <Button variant="secondary" size="sm" fullWidth disabled>
            Study notes
          </Button>
          <p className="text-[11px] leading-snug text-muted">
            This concept&apos;s study notes are not written yet.
          </p>
        </>
      )}
    </div>
  )
}

export default ConceptActions
