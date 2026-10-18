/**
 * useCourseBank — every question the course can ask, for the practice setup.
 *
 * While the content is local (`isMocked('content')`) the bank is read straight
 * from the loader, topic by topic, because a course summary reports counts but
 * not the questions themselves. When the real backend is on, the course payload
 * is used as it arrives: a backend that sends no questions yields an empty bank,
 * and the setup page says so rather than inventing one.
 */

import { useQuery } from '@tanstack/react-query'
import { isMocked } from '../api/mocks/config.js'
import { apiFetch } from '../api/client.js'
import { getCourse, getTopic } from '../content/os/index.js'
import { courseBank } from '../content/questionBank.js'
import { DEFAULT_COURSE_ID } from './useCourse.js'

function localTopics(courseId) {
  const course = getCourse(courseId)
  return (course?.topics ?? []).map((topic) => getTopic(topic.id))
}

export async function loadCourseBank(courseId = DEFAULT_COURSE_ID) {
  if (isMocked('content')) {
    return { courseId, topics: courseBank(localTopics(courseId)) }
  }
  const course = await apiFetch(`/courses/${courseId}`)
  return { courseId, topics: courseBank(course?.topics ?? []) }
}

export function useCourseBank(courseId = DEFAULT_COURSE_ID) {
  return useQuery({
    queryKey: ['content', 'bank', courseId],
    queryFn: () => loadCourseBank(courseId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export default useCourseBank
