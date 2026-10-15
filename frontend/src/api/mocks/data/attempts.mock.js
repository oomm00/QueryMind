/**
 * Mock Attempts Evaluation Data
 * Contract shape: { score, criteria_scores, feedback_text, correct_answer? }
 */

export function createMockAttemptFeedback({ question_id, answer_text } = {}) {
  const answerLength = (answer_text || '').trim().length
  const baseScore = answerLength > 100 ? 0.88 : answerLength > 30 ? 0.72 : 0.45

  return {
    score: baseScore,
    criteria_scores: {
      conceptual_accuracy: Math.min(1.0, +(baseScore + 0.05).toFixed(2)),
      clarity_and_structure: Math.min(1.0, +(baseScore + 0.02).toFixed(2)),
      depth_of_reasoning: Math.max(0.3, +(baseScore - 0.08).toFixed(2)),
    },
    feedback_text: answerLength > 80
      ? 'Strong grasp of core architectural principles. You clearly articulated the mechanisms and trade-offs. To elevate your answer further, cite concrete concurrency primitives or isolation levels.'
      : 'Good start, but your explanation could be expanded with more detailed justification and technical terminology.',
    correct_answer: 'A comprehensive answer highlights deterministic state machine replication, quorum-based voting, atomic commit protocols, and graceful degradation during network partitions.',
  }
}
