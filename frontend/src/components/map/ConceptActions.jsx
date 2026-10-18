/**
 * ConceptActions — the two things a concept offers, in one place.
 *
 * The graph's side panel and the list view must offer the same next steps, so
 * both render this. Practice comes first and is never gated: a concept with no
 * study material, no written lesson and even no questions yet still shows the
 * button, which disables and says so when there is nothing to ask. The written
 * lesson is the secondary route, and a concept whose lessons are not written
 * keeps the button (so the shape of the page does not shift) and says why.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonClasses } from '../ui/Button'
import { StartPracticeButton } from '../practice/StartPracticeButton.jsx'
import { sentenceCase } from '../../lib/text'

export function ConceptActions({ courseId, topicId, concept, className }) {
  const nextLesson = (concept?.lessons ?? []).find((lesson) => !lesson.isPlaceholder) ?? null
  const questionCount = concept?.questionCount ?? 0

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <StartPracticeButton
        courseId={courseId}
        scope="concept"
        scopeId={concept?.id}
        label="Practice this concept"
        size="sm"
        fullWidth
      />
      <p className="text-[11px] leading-snug text-muted">
        {questionCount > 0
          ? `${questionCount} question${questionCount === 1 ? '' : 's'} in this concept's bank.`
          : 'No questions written for this concept yet.'}
      </p>

      {nextLesson ? (
        <Link
          to={`/learn/${courseId}/${topicId}/${nextLesson.id}`}
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
        >
          Written lesson: {sentenceCase(nextLesson.title)}
        </Link>
      ) : (
        <>
          <Button variant="secondary" size="sm" fullWidth disabled>
            Written lesson
          </Button>
          <p className="text-[11px] leading-snug text-muted">
            This concept&apos;s written lesson is not written yet.
          </p>
        </>
      )}
    </div>
  )
}

export default ConceptActions
