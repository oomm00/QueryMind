/**
 * usePracticeData — the course tree a practice session draws from.
 *
 * Local content while isMocked('content'), otherwise the course payload as the
 * backend sends it (a backend that sends no questions yields an empty tree, and
 * the pages say so). Cached by TanStack Query, so a Start button and the course
 * page share one read.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { practiceCourse } from '../content/practiceBank.js'

/** The courses that have content, as a stable query key. */
function keyFor(courseIds) {
  return [...new Set(courseIds.filter(Boolean))].sort()
}

export async function loadPracticeCourses(courseIds = []) {
  const ids = keyFor(courseIds)
  if (isMocked('content')) {
    return ids.map((id) => practiceCourse(id)).filter(Boolean)
  }
  const courses = await Promise.all(ids.map((id) => apiFetch(`/courses/${id}`)))
  return courses.filter(Boolean)
}

export function usePracticeData(courseIds = []) {
  const ids = keyFor(courseIds)
  return useQuery({
    queryKey: ['content', 'practice', ids],
    queryFn: () => loadPracticeCourses(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default usePracticeData
