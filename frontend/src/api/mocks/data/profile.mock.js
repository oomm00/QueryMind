/**
 * Mock Profile Data
 * Returns backend shape: mastery_breakdown rows { topic, bloom_level, mastery_score, attempts }
 */

export function createMockProfile(userId = 'mock-user-123') {
  return {
    user_id: userId,
    total_attempts: 16,
    average_score: 0.81,
    mastery_breakdown: [
      { topic: 'SQL Joins & Indexing', bloom_level: 'remember',   mastery_score: 0.95, attempts: 3 },
      { topic: 'SQL Joins & Indexing', bloom_level: 'understand', mastery_score: 0.88, attempts: 4 },
      { topic: 'SQL Joins & Indexing', bloom_level: 'apply',      mastery_score: 0.76, attempts: 2 },
      { topic: 'Transactions & ACID',  bloom_level: 'understand', mastery_score: 0.84, attempts: 3 },
      { topic: 'Transactions & ACID',  bloom_level: 'analyze',    mastery_score: 0.72, attempts: 2 },
      { topic: 'Distributed Consensus', bloom_level: 'evaluate',  mastery_score: 0.68, attempts: 2 },
    ],
    stub: true,
  }
}
