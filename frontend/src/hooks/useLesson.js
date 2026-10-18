/**
 * useLesson — one lesson and its blocks, for the lesson reader.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { getLesson } from '../content/os/index.js'

async function loadLesson(lessonId) {
  if (isMocked('content')) {
    return getLesson(lessonId)
  }
  return apiFetch(`/lessons/${lessonId}`)
}

export function useLesson(lessonId) {
  return useQuery({
    queryKey: ['content', 'lesson', lessonId],
    queryFn: () => loadLesson(lessonId),
    enabled: Boolean(lessonId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useLesson
