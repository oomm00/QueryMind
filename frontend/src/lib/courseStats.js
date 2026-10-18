/**
 * courseStats — the real practice figures for one course.
 *
 * Everything here is derived from a course's content tree and the student's
 * stored answers: how many concepts and questions the course holds, how many of
 * those concepts have been practised, how many answers produced that, and the
 * course's estimated mastery with the confidence behind it. A course with no
 * content, or with no answers, yields nulls rather than zeros dressed up as
 * measurement — the pages decide what to say.
 *
 * Pure, so Explore, My courses and the course page all report the same numbers.
 */

import { estimatesFrom, rollUp } from './mastery.js'

export function courseStats(tree, progress) {
  if (!tree) return null

  const concepts = tree.topics.flatMap((topic) => topic.concepts)
  const conceptIds = concepts.map((concept) => concept.id)
  const answers = progress?.concepts ?? {}
  const wanted = new Set(conceptIds)

  const practised = concepts.filter((concept) => answers[concept.id]).length
  const answerCount = Object.entries(answers).reduce((sum, [conceptId, entry]) => {
    if (!wanted.has(conceptId)) return sum
    return (
      sum +
      Object.values(entry ?? {}).reduce((inner, item) => inner + (Number(item.count) || 0), 0)
    )
  }, 0)

  return {
    concepts: concepts.length,
    questions: concepts.reduce((sum, concept) => sum + (concept.questions?.length ?? 0), 0),
    practised,
    coverage: concepts.length > 0 ? practised / concepts.length : null,
    answers: answerCount,
    mastery: rollUp(estimatesFrom(answers), conceptIds),
  }
}

/** Which course is a session id about - the concept title, the topic title, or null. */
function scopeName(tree, scopeId) {
  if (!tree || !scopeId) return null
  for (const topic of tree.topics) {
    if (topic.id === scopeId) return { title: topic.title, kind: 'topic' }
    for (const concept of topic.concepts) {
      if (concept.id === scopeId) return { title: concept.title, kind: 'concept' }
    }
  }
  return null
}

/**
 * Where a student last worked in a course.
 *
 * The most recent session for the course that has an answer in it names the
 * topic or concept it drew from; a session with nothing answered is only used as
 * a fallback. Returns null when nothing has been started, so the page can leave
 * the line out rather than invent one.
 */
export function lastPractised(tree, sessions = [], courseId) {
  const mine = (sessions ?? []).filter((session) => session?.courseId === courseId)
  if (mine.length === 0) return null

  const answered = mine.filter((session) => Object.keys(session.answers ?? {}).length > 0)
  const session = (answered.length > 0 ? answered : mine)[0]
  const scope = scopeName(tree, session.scopeId)

  return {
    at: session.submittedAt ?? session.createdAt ?? null,
    scopeId: session.scopeId ?? null,
    title: scope?.title ?? null,
    kind: scope?.kind ?? null,
    scope: session.scope ?? null,
    status: session.status ?? null,
  }
}


export default courseStats
