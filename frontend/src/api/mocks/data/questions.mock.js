/**
 * Mock Questions Data
 * Adheres strictly to the frontend contract:
 * { questions: [{ question_id, question_text, bloom_level, difficulty, topic, starter_code?, test_cases?, hints? }] }
 */

export function createMockQuestions({ topic = 'Distributed Systems', bloom_level = 'understand', difficulty = 'medium', count = 3 } = {}) {
  const templates = [
    {
      suffix: 'Mechanism & Core Properties',
      text: `Explain how consensus is achieved in a distributed system during network partitions when applying concepts of "${topic}". Highlight key trade-offs between consistency and availability.`,
      hints: ['Consider the CAP theorem and Raft leader election.', 'Think about quorum slices.'],
    },
    {
      suffix: 'Scenario Analysis',
      text: `Analyze a scenario in "${topic}" where concurrent transactions lead to a phantom read. How would serializable snapshot isolation prevent this anomaly?`,
      hints: ['Review MVCC read timestamps.', 'Consider write-skew vs phantom reads.'],
    },
    {
      suffix: 'Design & Application',
      text: `Given high write throughput requirements on "${topic}", design an optimal partitioning and replication strategy. Justify your architectural choices.`,
      hints: ['Consider consistent hashing.', 'Compare sync vs async replication.'],
    },
  ]

  const items = []
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length]
    items.push({
      question_id: `mock-q-${Date.now()}-${i + 1}`,
      question_text: `[${bloom_level.toUpperCase()} | ${difficulty.toUpperCase()}] ${template.text}`,
      bloom_level: bloom_level,
      difficulty: difficulty,
      topic: topic,
      starter_code: bloom_level === 'apply' ? `# Implementation for ${topic}\ndef solve():\n    pass\n` : undefined,
      test_cases: bloom_level === 'apply' ? [{ input: 'example', expected: 'valid' }] : undefined,
      hints: template.hints,
    })
  }

  return { questions: items }
}
