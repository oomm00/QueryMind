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

import { COURSE as OS_COURSE, getCourse as getOSCourse, getTopic as getOSTopic } from './os/index.js'
import { COURSE_LOADERS } from './catalog/index.js'
import { conceptBank } from './questionBank.js'

/** The courses that actually have content behind them. */
export function contentCourseIds() {
  return [OS_COURSE.id, ...Object.values(COURSE_LOADERS).map((loader) => loader.COURSE.id)]
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
  const osId = courseId === 'operating-systems' ? 'os' : courseId
  const loader =
    osId === OS_COURSE.id
      ? { COURSE: OS_COURSE, getCourse: getOSCourse, getTopic: getOSTopic }
      : Object.values(COURSE_LOADERS).find((entry) => entry.COURSE.id === osId)
  const course = loader?.getCourse(courseId)
  if (!course) return null

  const topics = course.topics
    .map((summary) => loader.getTopic(summary.id))
    .filter(Boolean)
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      subject: topic.subject ?? null,
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
    subject: course.topics.find((topic) => topic.subject)?.subject ?? null,
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

/**
 * The questions behind a list of ids, in the order they were asked.
 *
 * `own` is a session's own question bodies, which only a generated session
 * has: those questions are not in the content files, so they come first and the
 * bank answers for everything else. A session drawn from the bank passes
 * nothing and resolves exactly as it always did.
 */
export function resolveQuestions(questionIds = [], own = []) {
  const byId = questionIndex()
  const generated = new Map((own ?? []).map((question) => [question.question_id, question]))
  return questionIds.map((id) => generated.get(id) ?? byId.get(id)).filter(Boolean)
}
