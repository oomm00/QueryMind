/**
 * usePracticeContext — what buildSession needs to know about a student.
 *
 * Two plain maps, read from the mastery store: the estimated mastery of every
 * concept that has answers, and which concepts have any answers at all. A
 * concept with no answers has no estimate — that is the difference the "next
 * topic" rule and the lowest-estimate sort both rely on, so it is kept, rather
 * than flattened to 0.
 */

import { useMemo } from 'react'
import { estimatesFrom } from '../lib/mastery.js'
import { useProgress } from '../lib/masteryStore.js'

export function usePracticeContext(userId) {
  const progress = useProgress(userId)

  return useMemo(() => {
    const estimates = {}
    for (const [conceptId, estimate] of Object.entries(estimatesFrom(progress.concepts))) {
      estimates[conceptId] = estimate.value
    }
    return { estimates, answered: { ...progress.concepts } }
  }, [progress])
}

export default usePracticeContext
