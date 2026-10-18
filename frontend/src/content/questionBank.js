/**
 * questionBank — the questions a practice session can ask, read from content.
 *
 * The bank is exactly what the content files hold: a concept's authored
 * `questions[]`, plus the checks its study notes ask (the loader turns each of
 * those into a question). Nothing is generated, invented or templated here — a
 * concept with no questions yields an empty bank, and the pages say so.
 *
 * Sessions mix Bloom levels: `pickBank` round-robins the levels the bank
 * actually contains, so a session never asks one level on end while others are
 * available, and `bloomMix` reports the mix so the setup form can state it.
 *
 * Grading lives here too, because who grades a question follows from what kind
 * of question it is: an `mcq` is graded in the app from `correctIndex`, and a
 * `short` answer is self-marked against the authored rubric (see rubricScore).
 */

/** The badge a session shows on every question: it came from authored content. */
export const BANK_SOURCE_LABEL = 'Course bank'

/** Where one question in the bank came from, in words. */
export const ORIGIN_LABELS = {
  concept: 'Concept bank',
  lesson: 'Study notes check',
}

export const QUESTION_TYPE_LABELS = {
  mcq: 'Multiple choice',
  short: 'Short answer',
}

export const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export const ANY_DIFFICULTY = 'any'

/**
 * One content question in the shape the session, the question page and the
 * feedback page use. Field names stay close to the content file so a reader can
 * check an answer against the file it came from.
 */
export function toSessionQuestion(question, concept, origin = 'concept') {
  return {
    question_id: question.id,
    question_text: question.prompt ?? '',
    type: question.type ?? 'mcq',
    bloom_level: question.bloom ?? 'understand',
    difficulty: question.difficulty ?? 'medium',
    options: Array.isArray(question.options) ? question.options : [],
    correctIndex: question.correctIndex,
    answerKey: question.answerKey ?? '',
    rubric: Array.isArray(question.rubric) ? question.rubric : [],
    explanation: question.explanation ?? '',
    needsHumanCheck: question.needsHumanCheck ?? true,
    // Where it came from, so the page can name the concept and the source.
    topic: concept?.title ?? '',
    conceptId: concept?.id ?? '',
    conceptTitle: concept?.title ?? '',
    topicId: concept?.topicId ?? '',
    origin,
    originLabel: ORIGIN_LABELS[origin] ?? ORIGIN_LABELS.concept,
    lessonId: question.lessonId ?? null,
    blockIndex: question.blockIndex ?? null,
    // The concept's own study material, so feedback can point at it.
    resources: Array.isArray(concept?.resources) ? concept.resources : [],
  }
}

/** Every question a concept can be practised on: authored ones first. */
export function conceptBank(concept) {
  if (!concept) return []
  const authored = (concept.questions ?? []).map((question) =>
    toSessionQuestion(question, concept, 'concept')
  )
  const fromLessons = (concept.lessonQuestions ?? []).map((question) =>
    toSessionQuestion(question, concept, 'lesson')
  )
  return [...authored, ...fromLessons]
}

function conceptList(concepts) {
  if (Array.isArray(concepts)) return concepts
  return Object.values(concepts ?? {})
}

/**
 * A topic's bank: its concepts that have questions, and the same questions
 * flattened for a topic-wide session. A topic with nothing to ask comes back
 * with `questions: []` rather than being dropped, so callers can tell "empty"
 * from "unknown".
 */
export function topicBank(topic) {
  if (!topic) return null
  const concepts = conceptList(topic.concepts)
    .map((concept) => ({
      id: concept.id ?? '',
      title: concept.title ?? '',
      questions: conceptBank(concept),
    }))
    .filter((entry) => entry.questions.length > 0)

  return {
    id: topic.id ?? '',
    title: topic.title ?? '',
    conceptCount: concepts.length,
    concepts,
    questions: concepts.flatMap((entry) => entry.questions),
  }
}

/** The course's topics that have questions at all. */
export function courseBank(topics = []) {
  return topics.map(topicBank).filter((topic) => topic && topic.questions.length > 0)
}

/** How many questions sit at each Bloom level — what "mixed" means for a bank. */
export function bloomMix(questions = []) {
  const counts = new Map()
  for (const question of questions) {
    const level = question.bloom_level ?? 'understand'
    counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  return [...counts.entries()].map(([level, count]) => ({ level, count }))
}

/** Round-robin the Bloom levels present, keeping the bank's order inside each. */
export function mixByBloom(questions = []) {
  const groups = []
  const byLevel = new Map()
  for (const question of questions) {
    const level = question.bloom_level ?? 'understand'
    if (!byLevel.has(level)) {
      byLevel.set(level, [])
      groups.push(byLevel.get(level))
    }
    byLevel.get(level).push(question)
  }

  const mixed = []
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0)
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      if (index < group.length) mixed.push(group[index])
    }
  }
  return mixed
}

/**
 * The questions for one session, mixed across Bloom levels and capped at
 * `count`. A difficulty preference is honoured only when the bank can fill the
 * session with it; otherwise the session covers the whole bank rather than
 * coming up short. `difficultyFit` reports which of the two happened.
 */
export function pickBank(questions = [], { count = 5, difficulty = ANY_DIFFICULTY } = {}) {
  const mixed = mixByBloom(questions)
  const wanted = Math.max(0, Math.min(Number(count) || 0, mixed.length))
  if (!difficulty || difficulty === ANY_DIFFICULTY) return mixed.slice(0, wanted)

  const matching = mixed.filter((question) => question.difficulty === difficulty)
  return (matching.length >= wanted ? matching : mixed).slice(0, wanted)
}

/** Whether the chosen difficulty can fill the whole session on its own. */
export function difficultyFit(questions = [], { count = 5, difficulty = ANY_DIFFICULTY } = {}) {
  const wanted = Math.min(Number(count) || 0, questions.length)
  if (!difficulty || difficulty === ANY_DIFFICULTY) return { used: false, matching: questions.length }
  const matching = questions.filter((question) => question.difficulty === difficulty).length
  return { used: matching >= wanted && wanted > 0, matching }
}

/**
 * What a practice link asked for, resolved against what the bank has. The
 * result is a `kind:id` choice the setup form can select; an unmatched request
 * falls back to the first thing the bank can actually ask, so a stale link
 * lands on a working form instead of an empty one.
 */
export function resolveChoice(topics = [], { topic = '', concept = '' } = {}) {
  const wanted = (value) => String(value ?? '').trim().toLowerCase()
  const findConcept = (value) => {
    for (const entry of topics) {
      const concept = entry.concepts.find(
        (candidate) => candidate.id === value || wanted(candidate.title) === wanted(value)
      )
      if (concept) return concept
    }
    return null
  }

  if (concept) {
    const match = findConcept(concept)
    if (match) return `concept:${match.id}`
  }

  if (topic) {
    const entry = topics.find(
      (candidate) => candidate.id === topic || wanted(candidate.title) === wanted(topic)
    )
    if (entry) return `topic:${entry.id}`
    // Links written before ids were passed name a concept in the topic slot.
    const match = findConcept(topic)
    if (match) return `concept:${match.id}`
  }

  for (const entry of topics) {
    if (entry.concepts.length > 0) return `concept:${entry.concepts[0].id}`
  }
  return topics.length > 0 ? `topic:${topics[0].id}` : ''
}

/** The questions behind a resolved choice. */
export function questionsForChoice(topics = [], choice = '') {
  const [kind, id] = String(choice).split(':')
  if (kind === 'concept') {
    for (const entry of topics) {
      const concept = entry.concepts.find((candidate) => candidate.id === id)
      if (concept) return concept.questions
    }
    return []
  }
  if (kind === 'topic') {
    const entry = topics.find((candidate) => candidate.id === id)
    return entry ? entry.questions : []
  }
  return []
}

/** What a resolved choice is called, for the session header and the breadcrumb. */
export function choiceLabel(topics = [], choice = '') {
  const [kind, id] = String(choice).split(':')
  if (kind === 'concept') {
    for (const entry of topics) {
      const concept = entry.concepts.find((candidate) => candidate.id === id)
      if (concept) return concept.title
    }
  }
  if (kind === 'topic') {
    const entry = topics.find((candidate) => candidate.id === id)
    if (entry) return entry.title
  }
  return ''
}

/** An mcq is graded in the app, from the authored `correctIndex`. */
export function gradeChoice(question, selectedIndex) {
  const correct = Number.isInteger(selectedIndex) && selectedIndex === question?.correctIndex
  return { correct, score: correct ? 1 : 0, selfMarked: false }
}

/**
 * A short answer is self-marked: the student says which rubric criteria they
 * met, and the score is the share of points those criteria carry. There is no
 * model in the loop, so the result is reported as self-marked everywhere.
 */
export function rubricScore(rubric = [], metIndexes = []) {
  const total = rubric.reduce((sum, criterion) => sum + (Number(criterion?.points) || 0), 0)
  const met = new Set(Array.isArray(metIndexes) ? metIndexes : [])
  const earned = rubric.reduce(
    (sum, criterion, index) => sum + (met.has(index) ? Number(criterion?.points) || 0 : 0),
    0
  )
  if (!(total > 0)) return { score: 0, earned: 0, total: 0 }
  return { score: earned / total, earned, total }
}
