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

export default courseStats
