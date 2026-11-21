/**
 * The run, exercised with a fake call instead of a fetch.
 *
 * The backend now honours the count and owns duplicates, Bloom gating and the
 * deadline. The rules worth pinning here are the ones the browser still owns:
 * ONE call per run, the count and adaptive flag it sends, how the returned
 * questions land in session shape, and what Cancel and a refusal do to it.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  GENERATED_ORIGIN_LABEL,
  RATE_LIMIT_WAIT_MS,
  generatedToSessionQuestion,
  normaliseScore,
  retryAfterMs,
  runGeneration,
} from './generateRun.js'

/** A failure the way the endpoint builds one: the code lives in the body. */
function failure(code, extra = {}) {
  return Object.assign(new Error('backend detail, for the logs'), {
    data: { code, detail: 'backend detail, for the logs', ...extra },
  })
}

function question(text, bloom = 'understand', extra = {}) {
  return {
    question_id: `q-${text}`,
    question_text: text,
    bloom_level: bloom,
    difficulty: 'medium',
    ...extra,
  }
}

/** A whole run in one response, as the backend now returns it. */
function batch(count, bloom = 'apply', extra = {}) {
  return {
    questions: Array.from({ length: count }, (_, index) =>
      question(`question ${index + 1}`, bloom, {
        source: 'live',
        adaptive_reason: 'moving up after strong answers',
      })
    ),
    ...extra,
  }
}

describe('a run of N questions', () => {
  it('makes exactly ONE call with count and num_questions set to what was wanted', async () => {
    const generate = vi.fn().mockResolvedValue(batch(6))

    const outcome = await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply', 'analyze'],
      count: 6,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0]).toMatchObject({
      topic: 'Deadlocks',
      subject: 'OS',
      count: 6,
      num_questions: 6,
      adaptive: true,
    })
    expect(outcome.questions).toHaveLength(6)
    expect(outcome.skipped).toBe(0)
    expect(outcome.error).toBeNull()
  })

  it('passes an explicit manual override through to the single call', async () => {
    const generate = vi.fn().mockResolvedValue(batch(2))

    await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      difficulty: 'hard',
      blooms: ['evaluate'],
      count: 2,
      adaptive: false,
      uploaded_only: true,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0]).toMatchObject({
      adaptive: false,
      difficulty: 'hard',
      bloom_level: 'evaluate',
      uploaded_only: true,
    })
  })

  it('reports the ready count once the batch arrives', async () => {
    const seen = []
    const generate = vi.fn().mockResolvedValue(batch(4))

    await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 4,
      onProgress: (progress) => seen.push(progress),
    })

    expect(seen.at(-1)).toEqual({ ready: 4, target: 4, skipped: 0 })
  })

  it('keeps a short batch and counts the rest as skipped, not as an error', async () => {
    const generate = vi.fn().mockResolvedValue(batch(2))

    const outcome = await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 6,
    })

    expect(outcome.questions).toHaveLength(2)
    expect(outcome.skipped).toBe(4)
    expect(outcome.error).toBeNull()
  })

  it('hands every question the source, adaptive reason and concept it belongs to', async () => {
    const generate = vi.fn().mockResolvedValue(batch(1, 'evaluate'))

    const outcome = await runGeneration({
      generate,
      topic: 'Deadlock Detection',
      subject: 'OS',
      difficulty: 'hard',
      blooms: ['evaluate'],
      count: 1,
      adaptive: true,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    const [generated] = outcome.questions
    expect(generated.origin).toBe('generated')
    expect(generated.originLabel).toBe(GENERATED_ORIGIN_LABEL)
    expect(generated.conceptId).toBe('custom:deadlock-detection')
    expect(generated.conceptTitle).toBe('Deadlock Detection')
    expect(generated.bloom_level).toBe('evaluate')
    expect(generated.source).toBe('live')
    expect(generated.adaptive_reason).toBe('moving up after strong answers')
  })

  it('also accepts the legacy single-question response shape', async () => {
    const generate = vi.fn().mockResolvedValue(
      question('Explain a deadlock.', 'understand', {
        source: 'cache',
        adaptive_reason: 'starting at the first rung',
      })
    )

    const outcome = await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      count: 1,
    })

    expect(generate).toHaveBeenCalledTimes(1)
    expect(outcome.questions).toHaveLength(1)
    expect(outcome.questions[0].source).toBe('cache')
    expect(outcome.questions[0].adaptive_reason).toBe('starting at the first rung')
  })
})

describe('a failed call that stops the run', () => {
  it('reports NO_CONTEXT without an error, so the page can suggest a topic', async () => {
    const generate = vi.fn().mockRejectedValue(failure('NO_CONTEXT'))

    const outcome = await runGeneration({
      generate,
      topic: 'Quantum computing',
      subject: 'general',
      blooms: ['apply'],
      count: 6,
    })

    expect(outcome.noContext).toBe(true)
    expect(outcome.error).toBeNull()
    expect(outcome.questions).toHaveLength(0)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('keeps any other failure for the page to read as a sentence', async () => {
    const generate = vi.fn().mockRejectedValue(failure('LLM_NOT_CONFIGURED'))

    const outcome = await runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 6,
    })

    expect(outcome.questions).toHaveLength(0)
    expect(outcome.error.data.code).toBe('LLM_NOT_CONFIGURED')
    expect(outcome.noContext).toBe(false)
  })
})

describe('Cancel', () => {
  it('stops the one request without inventing questions', async () => {
    const controller = new AbortController()
    const generate = vi.fn(
      (_payload, { signal } = {}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted.')
            error.name = 'AbortError'
            reject(error)
          })
        })
    )

    const run = runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply', 'analyze'],
      count: 6,
      signal: controller.signal,
    })

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(generate).toHaveBeenCalledTimes(1)
    controller.abort()
    const outcome = await run

    expect(outcome.cancelled).toBe(true)
    expect(outcome.questions).toHaveLength(0)
  })
})

describe('the helpers', () => {
  it('reads Retry-After from the body, the error itself, then falls back', () => {
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED', { retry_after: 3 }))).toBe(3000)
    expect(retryAfterMs({ retryAfter: 2 })).toBe(2000)
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED'))).toBe(RATE_LIMIT_WAIT_MS)
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED', { retry_after: 600 }))).toBe(30_000)
  })

  it('treats a score that never arrived as unscored, not zero', () => {
    expect(normaliseScore(null)).toBeNull()
    expect(normaliseScore(undefined)).toBeNull()
    expect(normaliseScore('')).toBeNull()
    expect(normaliseScore(0)).toBe(0)
    expect(normaliseScore(75)).toBe(0.75)
  })
})

describe('a generated question in the session’s shape', () => {
  it('is an mcq when it has options and a correct answer that matches one', () => {
    const mapped = generatedToSessionQuestion(
      {
        question_id: 'q-1',
        question_text: 'Which one?',
        options: ['A', 'B', 'C'],
        correct_answer: 'B',
        explanation: 'Because B.',
      },
      { topic: 'Deadlocks', conceptId: 'custom:deadlocks', bloom: 'apply' }
    )

    expect(mapped.type).toBe('mcq')
    expect(mapped.correctIndex).toBe(1)
    expect(mapped.needsHumanCheck).toBe(false)
    expect(mapped.origin).toBe('generated')
    expect(mapped.originLabel).toBe(GENERATED_ORIGIN_LABEL)
    expect(mapped.conceptId).toBe('custom:deadlocks')
  })

  it('is a short answer when there is nothing to choose between', () => {
    const mapped = generatedToSessionQuestion(
      { question_text: 'Explain a deadlock.' },
      {
        topic: 'Deadlocks',
        conceptId: 'custom:deadlocks',
        bloom: 'understand',
        fallbackId: 'generated:custom:deadlocks:0',
      }
    )

    expect(mapped.type).toBe('short')
    expect(mapped.needsHumanCheck).toBe(true)
    expect(mapped.correctIndex).toBeUndefined()
    // The adapter refuses to invent a backend id; the session still needs a key.
    expect(mapped.question_id).toBe('generated:custom:deadlocks:0')
  })

  it('carries the source and the adaptive reason through to the session', () => {
    const mapped = generatedToSessionQuestion(
      {
        question_text: 'Explain a deadlock.',
        source: 'live',
        adaptive_reason: 'moving up after strong answers',
      },
      { topic: 'Deadlocks', fallbackId: 'generated:custom:deadlocks:0' }
    )

    expect(mapped.source).toBe('live')
    expect(mapped.adaptive_reason).toBe('moving up after strong answers')
  })
})
