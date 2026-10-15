/**
 * Mock Documents, Goals, Next-Params, and History Data
 */

export const mockDocumentUploadResponse = {
  document_id: 'mock-doc-987-abc',
  status: 'processed',
}

export function createMockProfileGoal(userId = 'mock-user-123') {
  return {
    user_id: userId,
    goal: 'Pass AWS Certified Solutions Architect & System Design',
    target_date: '2026-11-30',
  }
}

export function createMockNextParams(userId = 'mock-user-123') {
  return {
    topic: 'Transactions & ACID',
    bloom_level: 'analyze',
  }
}

export function createMockHistory(userId = 'mock-user-123') {
  return [
    {
      attempt_id: 'att-101',
      question_id: 'mock-q-1',
      topic: 'SQL Joins & Indexing',
      bloom_level: 'understand',
      difficulty: 'medium',
      score: 0.88,
      submitted_at: '2026-10-15T09:30:00Z',
    },
    {
      attempt_id: 'att-102',
      question_id: 'mock-q-2',
      topic: 'Transactions & ACID',
      bloom_level: 'analyze',
      difficulty: 'hard',
      score: 0.74,
      submitted_at: '2026-10-14T15:20:00Z',
    },
    {
      attempt_id: 'att-103',
      question_id: 'mock-q-3',
      topic: 'Distributed Consensus',
      bloom_level: 'evaluate',
      difficulty: 'hard',
      score: 0.68,
      submitted_at: '2026-10-13T11:10:00Z',
    },
  ]
}
