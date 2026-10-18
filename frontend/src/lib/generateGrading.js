/**
 * generateGrading — who marks a generated question.
 *
 * A question drawn from the course bank is graded in the app: an mcq against
 * its authored `correctIndex`, a short answer by the student against the
 * author's rubric. A generated question has neither - the model wrote it, so
 * the model's own marking is the only one available - and it arrives through
 * the attempt endpoint the app already speaks, whose adapter turns the
 * response into `{ score, feedback_text, correct_answer }`.
 *
 * The one thing this module adds is the scale: the backend grades out of its
 * own maximum, and the session, the marks and the mastery store all speak in
 * shares of one. `normaliseScore` is that conversion, and it happens here so no
 * caller has to remember to do it.
 *
 * A failure returns null rather than throwing: an answer nobody could mark is
 * reported as unscored by the results page, which is the truth, and it must not
 * stop the rest of the session from being scored.
 */

import { attemptsApi } from '../api/endpoints/attempts.js'
import { normaliseScore } from './generateRun.js'

/**
 * Ask the backend to mark one written answer.
 *
 * The mark comes back whole - the share of one it earned and whatever the
 * marker wrote about it - because both are shown to the student on the results
 * page. `null` means nothing was marked at all: no id, no answer, a refused
 * call, or a response with no score in it. That is reported as unscored rather
 * than as zero.
 *
 * @param {{question_id: string}} question
 * @param {string} answerText
 * @param {string} userId
 * @returns {Promise<{score: number, feedback: string}|null>}
 */
export async function gradeGeneratedAnswer(question, answerText, userId) {
  if (!question?.question_id) return null
  const text = String(answerText ?? '').trim()
  if (!text) return null

  try {
    const result = await attemptsApi.submit(
      { question_id: question.question_id, answer_text: text },
      userId
    )
    const score = normaliseScore(result?.score)
    if (score == null) return null
    return { score, feedback: String(result?.feedback_text ?? '').trim() }
  } catch {
    return null
  }
}

export default gradeGeneratedAnswer
