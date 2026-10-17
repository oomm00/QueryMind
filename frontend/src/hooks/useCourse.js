/**
 * useCourse — the Operating Systems course with its topic list.
 *
 * Served from the local content loader while content has no backend service
 * (isMocked('content')), otherwise from GET /courses/{id}. TanStack Query caches
 * the result, so navigation between topics re-renders instantly.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { getCourse } from '../content/os/index.js'

export const DEFAULT_COURSE_ID = 'os'

async function loadCourse(courseId) {
  if (isMocked('content')) {
    return getCourse(courseId)
  }
  return apiFetch(`/courses/${courseId}`)
}

export function useCourse(courseId = DEFAULT_COURSE_ID) {
  return useQuery({
    queryKey: ['content', 'course', courseId],
    queryFn: () => loadCourse(courseId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useCourse
