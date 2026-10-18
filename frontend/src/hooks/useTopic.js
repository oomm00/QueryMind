/**
 * useTopic — one topic with its concepts, for the topic outline.
 *
 * Local content while isMocked('content'). The backend exposes topics inside
 * GET /courses/{id} rather than under their own path, so the real branch reads
 * the course and selects the topic from it.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { getTopic } from '../content/os/index.js'
import { DEFAULT_COURSE_ID } from './useCourse.js'

async function loadTopic(topicId, courseId) {
  if (isMocked('content')) {
    return getTopic(topicId)
  }
  const course = await apiFetch(`/courses/${courseId}`)
  return (course?.topics ?? []).find((topic) => topic.id === topicId) ?? null
}

export function useTopic(topicId, courseId = DEFAULT_COURSE_ID) {
  return useQuery({
    queryKey: ['content', 'topic', courseId, topicId],
    queryFn: () => loadTopic(topicId, courseId),
    enabled: Boolean(topicId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useTopic
