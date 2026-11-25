import { describe, expect, it, vi } from 'vitest'
import { runGeneration } from './generateRun.js'

describe('runGeneration', () => {
  it('makes exactly ONE backend call for the whole run', async () => {
    const generate = vi.fn().mockResolvedValue({
      questions: [
        { question_id: 'q1', question_text: 'One?', correct_answer: 'a', bloom_level: 'remember' },
        { question_id: 'q2', question_text: 'Two?', correct_answer: 'b', bloom_level: 'understand' },
        { question_id: 'q3', question_text: 'Three?', correct_answer: 'c', bloom_level: 'apply' },
      ],
    })

    const result = await runGeneration({
      generate, topic: 'Deadlocks', subject: 'OS', blooms: ['remember', 'understand', 'apply'],
      count: 3, adaptive: true,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0].num_questions).toBe(3)
    expect(generate.mock.calls[0][0].count).toBe(3)
    expect(result.questions).toHaveLength(3)
    expect(result.error).toBeNull()
    expect(result.skipped).toBe(0)
  })
})
