/**
 * practiceBank — the course tree in the shape a practice session needs.
 *
 * `buildSession` is pure, so something has to hand it the content: this module
 * resolves the content loader into { course -> topic -> concept -> questions }
 * and keeps one flat index of every question by id, which is how a stored
 * session (which holds ids, not questions) is resolved back into questions.
 *
 * The tree carries the questions exactly as the content files author them — an
 * empty concept is empty — so nothing downstream has to guess.
 */

import { COURSE, getCourse, getTopic } from './os/index.js'
import { conceptBank } from './questionBank.js'

/** The courses that actually have content behind them. */
export function contentCourseIds() {
  return [COURSE.id]
}

function conceptQuestions(concept, course, topic) {
  return conceptBank(concept).map((question) => ({
    ...question,
    courseId: course.id,
    topicId: topic.id,
    conceptId: concept.id,
  }))
}

/**
 * One course and its full tree, ready for buildSession. The returned `id` is the
 * id the caller asked for (a catalog slug may differ from the content id), so a
 * session keeps pointing at the same course the student opened.
 */
export function practiceCourse(courseId) {
  const course = getCourse(courseId)
  if (!course) return null

  const topics = course.topics
    .map((summary) => getTopic(summary.id))
    .filter(Boolean)
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      summary: topic.summary ?? '',
      concepts: topic.concepts.map((concept) => ({
        id: concept.id,
        title: concept.title,
        summary: concept.summary ?? '',
        questionCount: concept.questionCount ?? 0,
        resourceCount: concept.resourceCount ?? 0,
        resources: concept.resources ?? [],
        lessonIds: concept.lessonIds ?? [],
        lessons: concept.lessons ?? [],
        questions: conceptQuestions(concept, course, topic),
      })),
    }))

  return {
    id: courseId,
    contentId: course.id,
    title: course.title,
    summary: course.summary ?? '',
    level: course.level ?? '',
    topics,
  }
}

/**
 * Every question the content holds, by id, so a stored session can be resolved.
 * Built once: the content is imported eagerly and never changes at runtime.
 */
let index = null

export function questionIndex() {
  if (index) return index
  index = new Map()
  for (const courseId of contentCourseIds()) {
    const course = practiceCourse(courseId)
    for (const topic of course?.topics ?? []) {
      for (const concept of topic.concepts) {
        for (const question of concept.questions) index.set(question.question_id, question)
      }
    }
  }
  return index
}

/** The questions behind a list of ids, in the order they were asked. */
export function resolveQuestions(questionIds = []) {
  const byId = questionIndex()
  return questionIds.map((id) => byId.get(id)).filter(Boolean)
}
