/**
 * marks — what a question is worth, and what a session scored.
 *
 * QueryMind grades in marks, and how many marks a question carries follows from
 * the thinking it asks for: recalling a fact is worth less than weighing a
 * decision. `MARKS_BY_BLOOM` is the whole rule.
 *
 * A multiple-choice answer is right or wrong (1 or 0). A short answer is
 * self-marked against the author's rubric, so its score is the share of the
 * rubric the student said they met — 0..1 — and its marks are that share of the
 * question's marks. Nothing here invents a score: a question with no answer has
 * none, and a short answer that has not been marked yet has none either.
 *
 * Pure functions only: no storage, no React, no content.
 */

/** The marks a question is worth, by the Bloom level it asks for. */
export const MARKS_BY_BLOOM = {
  remember: 1,
  understand: 1,
  apply: 2,
  analyze: 2,
  evaluate: 3,
  create: 3,
}

/** The marks a Bloom level carries. An unfamiliar level is worth the minimum. */
export function marksFor(bloom) {
  return MARKS_BY_BLOOM[String(bloom ?? '').toLowerCase()] ?? 1
}

/** The marks one question carries. */
export function marksForQuestion(question) {
  return marksFor(question?.bloom_level)
}

/** The marks a whole set of questions is worth. */
export function marksAvailable(questions = []) {
  return questions.reduce((sum, question) => sum + marksForQuestion(question), 0)
}

/**
 * The 0..1 score an answer produced, or null when nothing has been scored yet.
 *
 * An mcq needs a chosen option; a short answer needs a self-mark. An answer
 * that is missing — or a short answer that is written but unmarked — has no
 * score and therefore moves neither the session total nor mastery.
 */
export function scoreOf(question, answer, selfMark) {
  if (!question) return null
  if (question.type === 'mcq') {
    const selected = answer?.selected
    if (!Number.isInteger(selected)) return null
    return selected === question.correctIndex ? 1 : 0
  }
  const score = selfMark?.score
  return typeof score === 'number' && Number.isFinite(score) ? score : null
}

/** The marks an answered question earned, or null when it has no score. */
export function marksEarnedFor(question, answer, selfMark) {
  const score = scoreOf(question, answer, selfMark)
  if (score == null) return null
  return marksForQuestion(question) * score
}

/**
 * A whole session's score, in marks and as a share of the questions scored so
 * far.
 *
 * The denominator is the marks of the questions that have a score, not of the
 * whole test: a question the student has not answered, or a short answer they
 * have not marked, is reported as unscored and left out of the percentage with a
 * visible note. That is why the result also carries `answered` and `unscored`,
 * so the page can say what is still open.
 */
export function scoreSession(questions = [], answers = {}, selfMarks = {}) {
  const byLevel = new Map()
  const unscored = []
  let earned = 0
  let available = 0
  let answered = 0

  for (const question of questions) {
    const level = question.bloom_level ?? 'understand'
    const bucket = byLevel.get(level) ?? { level, earned: 0, available: 0, count: 0 }
    bucket.count += 1
    byLevel.set(level, bucket)

    const answer = answers?.[question.question_id] ?? null
    const isAnswered =
      question.type === 'mcq'
        ? Number.isInteger(answer?.selected)
        : Boolean(String(answer?.text ?? '').trim())
    if (isAnswered) answered += 1

    const score = scoreOf(question, answer, selfMarks?.[question.question_id])
    if (score == null) {
      unscored.push({
        question,
        reason: question.type === 'mcq' ? 'unanswered' : 'not-marked',
      })
      continue
    }

    const marks = marksForQuestion(question)
    earned += marks * score
    available += marks
    bucket.earned += marks * score
    bucket.available += marks
  }

  return {
    earned,
    available,
    percent: available > 0 ? earned / available : null,
    answered,
    total: questions.length,
    unscored,
    byLevel: [...byLevel.values()],
  }
}
