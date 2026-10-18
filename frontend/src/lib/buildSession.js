/**
 * buildSession — choosing what one practice session asks.
 *
 * This is the whole of the app's "what next?" rule, kept pure so it can be
 * checked without a browser: it takes the content tree, what the student has
 * already answered, and the request, and returns the questions to ask.
 *
 * A level is a band of Bloom levels, not the content's `difficulty` field:
 *
 *   easy   remember + understand
 *   medium apply + analyze
 *   hard   evaluate + create
 *   mixed  every level, ordered so consecutive questions differ where they can
 *
 * The scope decides which questions are in play. `course` picks the next topic
 * — the first in course order with no answers, or the one with the lowest
 * estimate once they all have answers. `topic` spreads across its concepts,
 * unanswered ones first and then the lowest estimates. `concept` is that one
 * concept. `mixed` is across all the courses it is given. `retry` is an explicit
 * set of question ids (the ones a student missed).
 *
 * When a band cannot fill the session, the neighbours make up the difference and
 * the session says so in `note`, so the page can tell the student why a "hard"
 * session holds a medium question. Nothing is invented: if there is nothing to
 * ask, the result is empty and the caller disables the button.
 */

/** Which Bloom levels each level covers. */
export const LEVEL_BANDS = {
  easy: ['remember', 'understand'],
  medium: ['apply', 'analyze'],
  hard: ['evaluate', 'create'],
}

/** The band next to each band, in the order it should fill a short session. */
const NEIGHBOURS = {
  easy: ['medium'],
  medium: ['easy', 'hard'],
  hard: ['medium'],
}

const ALL_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

/** The segmented control on the course page, in order. */
export const PRACTICE_LEVELS = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export const DEFAULT_SESSION_COUNT = 6

/** The Bloom levels a level covers; mixed covers them all. */
export function levelsFor(level) {
  return LEVEL_BANDS[level] ?? [...ALL_LEVELS]
}

// ── Reading the tree ────────────────────────────────────────

function conceptsOf(topic) {
  return topic?.concepts ?? []
}

function conceptQuestions(course, topic, concept) {
  return (concept?.questions ?? []).map((question) => ({
    ...question,
    courseId: course.id,
    topicId: topic.id,
    conceptId: concept.id,
  }))
}

function topicQuestions(course, topic) {
  return conceptsOf(topic).flatMap((concept) => conceptQuestions(course, topic, concept))
}

function courseQuestions(course) {
  return (course?.topics ?? []).flatMap((topic) => topicQuestions(course, topic))
}

function topicHasQuestions(topic) {
  return conceptsOf(topic).some((concept) => (concept?.questions ?? []).length > 0)
}

function topicAnswered(topic, answered = {}) {
  return conceptsOf(topic).some((concept) => answered[concept.id])
}

function estimateOf(conceptId, estimates = {}) {
  const value = estimates[conceptId]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function topicMastery(topic, estimates) {
  const values = conceptsOf(topic)
    .map((concept) => estimateOf(concept.id, estimates))
    .filter((value) => value != null)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The topic a course session should ask about next: the first one with questions
 * that still has an unanswered concept, otherwise the one with the lowest
 * estimated mastery. Returns null when the course has nothing to ask.
 */
export function nextTopicOf(course, { estimates = {}, answered = {} } = {}) {
  const topics = (course?.topics ?? []).filter(topicHasQuestions)
  if (topics.length === 0) return null

  const unanswered = topics.find((topic) => !topicAnswered(topic, answered))
  if (unanswered) return unanswered

  const ranked = [...topics].sort(
    (a, b) => (topicMastery(a, estimates) ?? 1) - (topicMastery(b, estimates) ?? 1)
  )
  return ranked[0]
}

/**
 * A topic's concepts in the order to ask them: unanswered concepts first, then
 * the ones with the lowest estimates. Only concepts with questions count.
 */
function preferredConceptIds(topic, { estimates = {}, answered = {} } = {}) {
  const concepts = conceptsOf(topic).filter((concept) => (concept?.questions ?? []).length > 0)
  const unanswered = concepts.filter((concept) => !answered[concept.id])
  const answeredConcepts = concepts
    .filter((concept) => answered[concept.id])
    .sort((a, b) => (estimateOf(a.id, estimates) ?? 1) - (estimateOf(b.id, estimates) ?? 1))
  return [...unanswered, ...answeredConcepts].map((concept) => concept.id)
}

// ── Choosing the candidates ─────────────────────────────────

function findConcept(courses, conceptId) {
  for (const course of courses) {
    for (const topic of course.topics ?? []) {
      if (topic.id === conceptId) continue
      for (const concept of conceptsOf(topic)) {
        if (concept.id === conceptId) return { course, topic, concept }
      }
    }
  }
  return null
}

function chooseScope(request, data) {
  const courses = data.courses ?? []
  const scope = request.scope ?? 'course'
  const scopeId = request.scopeId ?? null

  if (scope === 'mixed') {
    return {
      questions: courses.flatMap(courseQuestions),
      courseId: null,
      scopeId: null,
      conceptOrder: null,
    }
  }

  if (scope === 'retry') {
    const wanted = new Set(request.questionIds ?? [])
    const questions = courses.flatMap(courseQuestions).filter((q) => wanted.has(q.question_id))
    return {
      questions,
      courseId: request.courseId ?? null,
      scopeId: null,
      conceptOrder: null,
    }
  }

  if (scope === 'concept') {
    const found = findConcept(courses, scopeId)
    if (!found) return { questions: [], courseId: request.courseId ?? null, scopeId, conceptOrder: null }
    return {
      questions: conceptQuestions(found.course, found.topic, found.concept),
      courseId: found.course.id,
      scopeId,
      conceptOrder: [found.concept.id],
    }
  }

  const course = courses.find((candidate) => candidate.id === request.courseId) ?? courses[0] ?? null
  if (!course) return { questions: [], courseId: request.courseId ?? null, scopeId, conceptOrder: null }

  if (scope === 'topic') {
    const topic = (course.topics ?? []).find((candidate) => candidate.id === scopeId)
    if (!topic) return { questions: [], courseId: course.id, scopeId, conceptOrder: null }
    return {
      questions: topicQuestions(course, topic),
      courseId: course.id,
      scopeId: topic.id,
      conceptOrder: preferredConceptIds(topic, data),
    }
  }

  const topic = nextTopicOf(course, data)
  if (!topic) return { questions: [], courseId: course.id, scopeId: null, conceptOrder: null }
  return {
    questions: topicQuestions(course, topic),
    courseId: course.id,
    scopeId: topic.id,
    conceptOrder: preferredConceptIds(topic, data),
  }
}

// ── Ordering the questions ──────────────────────────────────

function dedupe(questions) {
  const seen = new Set()
  return questions.filter((question) => {
    if (!question.question_id || seen.has(question.question_id)) return false
    seen.add(question.question_id)
    return true
  })
}

/** Round-robin one question at a time from each concept, in the given order. */
function spreadByConcept(questions, conceptOrder) {
  const groups = new Map()
  for (const conceptId of conceptOrder) groups.set(conceptId, [])
  for (const question of questions) {
    if (!groups.has(question.conceptId)) groups.set(question.conceptId, [])
    groups.get(question.conceptId).push(question)
  }

  const out = []
  let placed = true
  while (placed) {
    placed = false
    for (const group of groups.values()) {
      if (group.length > 0) {
        out.push(group.shift())
        placed = true
      }
    }
  }
  return out
}

/** Reorder so consecutive questions differ in Bloom level where they can. */
function spreadByLevel(questions) {
  const pool = [...questions]
  const out = []
  let last = null
  while (pool.length > 0) {
    let index = pool.findIndex((question) => (question.bloom_level ?? 'understand') !== last)
    if (index === -1) index = 0
    const [next] = pool.splice(index, 1)
    out.push(next)
    last = next.bloom_level ?? 'understand'
  }
  return out
}

function levelOf(question) {
  return question.bloom_level ?? 'understand'
}

function noteFor(level, used) {
  const neighbour = NEIGHBOURS[level] ?? []
  const names = neighbour.length > 1 ? `${neighbour[0]} or ${neighbour[1]}` : neighbour[0]
  return `Not enough ${level} questions here, so a few are ${used ?? names}.`
}

/**
 * Draw one session.
 *
 * @param {object} request — { courseId, scope, scopeId, level, count, questionIds }
 * @param {object} data — { courses, estimates, answered }
 * @returns {{questions: Array, note: string, courseId: string|null,
 *            scopeId: string|null, scope: string, level: string}}
 */
export function buildSession(request = {}, data = {}) {
  const count = Math.max(0, Number(request.count ?? DEFAULT_SESSION_COUNT) || 0)
  const level = request.level ?? 'mixed'
  const scope = request.scope ?? 'course'
  const chosen = chooseScope(request, data)

  const deduped = dedupe(chosen.questions)
  const ordered = chosen.conceptOrder
    ? spreadByConcept(deduped, chosen.conceptOrder)
    : deduped

  const base = { courseId: chosen.courseId, scopeId: chosen.scopeId, scope, level }

  if (count === 0) return { ...base, questions: [], note: '' }

  if (level === 'mixed') {
    return { ...base, questions: spreadByLevel(ordered).slice(0, count), note: '' }
  }

  const allowed = new Set(levelsFor(level))
  const inBand = ordered.filter((question) => allowed.has(levelOf(question)))
  const picked = spreadByLevel(inBand).slice(0, count)
  if (picked.length >= count) return { ...base, questions: picked, note: '' }

  const neighbourLevels = new Set(
    (NEIGHBOURS[level] ?? []).flatMap((band) => LEVEL_BANDS[band] ?? [])
  )
  const neighbours = ordered.filter((question) => neighbourLevels.has(levelOf(question)))
  const fill = spreadByLevel(neighbours).slice(0, count - picked.length)

  return {
    ...base,
    questions: [...picked, ...fill],
    note: fill.length > 0 ? noteFor(level) : '',
  }
}

export default buildSession
