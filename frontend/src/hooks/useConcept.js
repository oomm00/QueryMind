/**
 * useConcept — one concept with its prerequisite graph and lessons, for the
 * concept map.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { getConcept } from '../content/os/index.js'

async function loadConcept(conceptId) {
  if (isMocked('content')) {
    return getConcept(conceptId)
  }
  return apiFetch(`/concepts/${conceptId}/graph`)
}

export function useConcept(conceptId) {
  return useQuery({
    queryKey: ['content', 'concept', conceptId],
    queryFn: () => loadConcept(conceptId),
    enabled: Boolean(conceptId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useConcept
