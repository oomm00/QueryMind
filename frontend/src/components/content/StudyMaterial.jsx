/**
 * StudyMaterial — the reading a concept offers, if any.
 *
 * QueryMind is a practice platform, so this list is deliberately secondary: it
 * is optional, it never gates a question, and an empty list is a valid state
 * that the app states plainly instead of filling with a guessed link.
 */

import React from 'react'
import { countOpened, useStudyMaterial } from '../../content/studyMaterial.js'
import { ResourceCard } from './ResourceCard'

export const NO_STUDY_MATERIAL = 'No study material added yet.'

export function StudyMaterial({ resources = [], className }) {
  // Subscribed so the "opened" count follows the cards' toggles.
  useStudyMaterial()

  if (!resources.length) {
    return <p className={`text-[13px] leading-relaxed text-muted ${className ?? ''}`}>{NO_STUDY_MATERIAL}</p>
  }

  const opened = countOpened(resources)

  return (
    <div className={className}>
      <p className="text-[11px] text-muted">
        {opened > 0
          ? `${opened} of ${resources.length} marked as opened`
          : `${resources.length} link${resources.length === 1 ? '' : 's'} — none marked as opened`}
      </p>
      <ul className="mt-2 space-y-2">
        {resources.map((resource) => (
          <ResourceCard key={resource.url ?? resource.title} resource={resource} />
        ))}
      </ul>
    </div>
  )
}

export default StudyMaterial
