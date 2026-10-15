/**
 * API Adapter Layer
 * ==================
 * Reconciles contract shapes used throughout the frontend with backend Pydantic models.
 * Rules:
 *  - Only the adapter knows backend field names (num_questions, user_answer, feedback, question).
 *  - Frontend uses contract shapes everywhere (question_id, question_text, answer_text, feedback_text, criteria_scores, count).
 *  - Renames fields and injects user_id.
 *  - MUST NOT fabricate question_id or criteria_scores; leave undefined if missing.
 */

// ── Question Generation ──────────────────────────────────────

/**
 * Converts frontend contract request -> backend payload
 */
export function adaptGenerateQuestionsRequest(contractBody, userId) {
  return {
    topic: contractBody.topic,
    subject: contractBody.subject || contractBody.topic,
    bloom_level: contractBody.bloom_level,
    difficulty: contractBody.difficulty,
    question_type: contractBody.question_type || 'open',
    num_questions: contractBody.count ?? 1,
    document_id: contractBody.document_id || null,
  }
}

/**
 * Converts backend response -> frontend contract response
 * Contract: { questions: [{ question_id, question_text, bloom_level, difficulty, topic, starter_code?, test_cases?, hints? }] }
 */
export function adaptGenerateQuestionsResponse(backendData) {
  if (!backendData) {
    return { questions: [] }
  }

  // Handle case where backend returns { questions: [...] }
  if (Array.isArray(backendData.questions)) {
    return {
      questions: backendData.questions.map(mapSingleQuestion),
    }
  }

  // Handle case where backend returns a single GeneratedQuestion object
  if (backendData.question || backendData.question_text) {
    return {
      questions: [mapSingleQuestion(backendData)],
    }
  }

  return { questions: [] }
}

function mapSingleQuestion(raw) {
  return {
    question_id: raw.question_id ?? raw.id ?? undefined, // NEVER FABRICATE
    question_text: raw.question_text ?? raw.question ?? '',
    bloom_level: raw.bloom_level,
    difficulty: raw.difficulty,
    topic: raw.topic,
    starter_code: raw.starter_code ?? undefined,
    test_cases: raw.test_cases ?? undefined,
    hints: raw.hints ?? undefined,
    options: raw.options ?? undefined,
    correct_answer: raw.correct_answer ?? undefined,
    explanation: raw.explanation ?? undefined,
  }
}

// ── Attempt Submission ───────────────────────────────────────

/**
 * Converts frontend contract request -> backend payload
 * Contract: { question_id, answer_text }
 */
export function adaptSubmitAttemptRequest(contractBody, userId) {
  return {
    question_id: contractBody.question_id,
    user_id: userId,
    user_answer: contractBody.answer_text,
    time_taken_seconds: contractBody.time_taken_seconds ?? null,
  }
}

/**
 * Converts backend response -> frontend contract response
 * Contract: { score, criteria_scores?, feedback_text, correct_answer? }
 */
export function adaptSubmitAttemptResponse(backendData) {
  if (!backendData) return {}

  return {
    score: backendData.score ?? 0,
    criteria_scores: backendData.criteria_scores ?? undefined, // NEVER FABRICATE
    feedback_text: backendData.feedback_text ?? backendData.feedback ?? '',
    correct_answer: backendData.correct_answer ?? undefined,
    attempt_id: backendData.attempt_id ?? undefined,
  }
}

// ── Profile Breakdown Selectors ──────────────────────────────

/**
 * Selects and aggregates mastery_breakdown rows by topic
 * @param {Array<{ topic: string, bloom_level: string, mastery_score: number, attempts: number }>} breakdown
 * @returns {Array<{ topic: string, average_score: number, total_attempts: number }>}
 */
export function selectPerTopicAverages(breakdown = []) {
  if (!Array.isArray(breakdown)) return []

  const topicMap = new Map()

  for (const row of breakdown) {
    const existing = topicMap.get(row.topic) || { totalScore: 0, count: 0, totalAttempts: 0 }
    existing.totalScore += (row.mastery_score ?? 0)
    existing.count += 1
    existing.totalAttempts += (row.attempts ?? 0)
    topicMap.set(row.topic, existing)
  }

  return Array.from(topicMap.entries()).map(([topic, data]) => ({
    topic,
    average_score: data.count > 0 ? +(data.totalScore / data.count).toFixed(2) : 0,
    total_attempts: data.totalAttempts,
  }))
}

/**
 * Selects and aggregates mastery_breakdown rows by Bloom level
 * @param {Array<{ topic: string, bloom_level: string, mastery_score: number, attempts: number }>} breakdown
 * @returns {Array<{ bloom_level: string, average_score: number, total_attempts: number }>}
 */
export function selectPerBloomAverages(breakdown = []) {
  if (!Array.isArray(breakdown)) return []

  const bloomMap = new Map()

  for (const row of breakdown) {
    const key = (row.bloom_level || '').toLowerCase()
    const existing = bloomMap.get(key) || { totalScore: 0, count: 0, totalAttempts: 0 }
    existing.totalScore += (row.mastery_score ?? 0)
    existing.count += 1
    existing.totalAttempts += (row.attempts ?? 0)
    bloomMap.set(key, existing)
  }

  return Array.from(bloomMap.entries()).map(([bloom_level, data]) => ({
    bloom_level,
    average_score: data.count > 0 ? +(data.totalScore / data.count).toFixed(2) : 0,
    total_attempts: data.totalAttempts,
  }))
}
