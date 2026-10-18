/**
 * The generation loop, exercised with a fake call instead of a fetch.
 *
 * The backend answers one question per call and ignores a count, so the rules
 * worth pinning are the ones a run of ten lives by: how many calls are in
 * flight, which Bloom level each one asks for, when a failure is worth another
 * go and when it is a slot lost, and what Cancel does to the calls still out.
 */

import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_ATTEMPTS,
  GENERATED_ORIGIN_LABEL,
  MAX_IN_FLIGHT,
  RATE_LIMIT_WAIT_MS,
  generatedToSessionQuestion,
  retryAfterMs,
  runGeneration,
} from './generateRun.js'

/** A failure the way the endpoint builds one: the code lives in the body. */
function failure(code, extra = {}) {
  return Object.assign(new Error('backend detail, for the logs'), {
    data: { code, detail: 'backend detail, for the logs', ...extra },
  })
}

/** A question the backend might hand back. */
function question(text, bloom = 'understand') {
  return {
    question_id: `q-${text}`,
    question_text: text,
    bloom_level: bloom,
    difficulty: 'medium',
  }
}

/**
 * A fake generate that records what it was asked and how many calls overlap.
 * `handler` decides each outcome.
 */
function fakeGenerate(handler) {
  const calls = []
  let inFlight = 0
  let peak = 0

  const generate = async (payload) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    calls.push(payload)
    try {
      // A turn of the event loop, so overlapping calls really do overlap.
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      return await handler(payload, calls.length)
    } finally {
      inFlight -= 1
    }
  }

  return {
    generate,
    calls,
    get peak() {
      return peak
    },
    bloomsAsked: () => calls.map((call) => call.bloom_level),
  }
}

/** One question back, in the shape the endpoint returns it. */
const one = (payload) => ({ questions: [question(`a ${payload.bloom_level} question`, payload.bloom_level)] })

describe('a run of N questions', () => {
  it('asks N times, two at a time, and keeps every question', async () => {
    const fake = fakeGenerate(one)

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      difficulty: 'medium',
      blooms: ['apply', 'analyze'],
      count: 6,
    })

    expect(outcome.questions).toHaveLength(6)
    expect(outcome.skipped).toBe(0)
    expect(fake.calls).toHaveLength(6)
    expect(fake.peak).toBeLessThanOrEqual(MAX_IN_FLIGHT)
    expect(fake.peak).toBe(2)
    expect(fake.calls.every((call) => call.count === 1)).toBe(true)
  })

  it('asks the levels it was given in turn, so a run is mixed', async () => {
    const fake = fakeGenerate(one)

    await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['remember', 'apply', 'create'],
      count: 6,
    })

    const asked = fake.bloomsAsked()
    expect(asked.filter((bloom) => bloom === 'remember')).toHaveLength(2)
    expect(asked.filter((bloom) => bloom === 'apply')).toHaveLength(2)
    expect(asked.filter((bloom) => bloom === 'create')).toHaveLength(2)
  })

  it('reports as the questions arrive', async () => {
    const fake = fakeGenerate(one)
    const seen = []

    await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 4,
      onProgress: (progress) => seen.push(progress.ready),
    })

    expect(seen.at(-1)).toBe(4)
    expect(seen[0]).toBeGreaterThan(0)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('hands every question the source and the concept it belongs to', async () => {
    const fake = fakeGenerate(one)

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlock Detection',
      subject: 'OS',
      difficulty: 'hard',
      blooms: ['evaluate'],
      count: 1,
    })

    const [generated] = outcome.questions
    expect(generated.origin).toBe('generated')
    expect(generated.originLabel).toBe(GENERATED_ORIGIN_LABEL)
    expect(generated.conceptId).toBe('custom:deadlock-detection')
    expect(generated.conceptTitle).toBe('Deadlock Detection')
    expect(generated.bloom_level).toBe('evaluate')
  })
})

describe('a failure worth another go', () => {
  it('asks a duplicate again at another Bloom, and keeps the question that came back', async () => {
    let asked = 0
    const fake = fakeGenerate((payload) => {
      asked += 1
      if (asked === 1) throw failure('DUPLICATE_QUESTION')
      return one(payload)
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply', 'analyze'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(1)
    expect(outcome.skipped).toBe(0)
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1].bloom_level).not.toBe(fake.calls[0].bloom_level)
  })

  it('drops the slot once a duplicate has been asked twice more', async () => {
    const fake = fakeGenerate(() => {
      throw failure('DUPLICATE_QUESTION')
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(0)
    expect(outcome.skipped).toBe(1)
    expect(outcome.error).toBeNull()
    expect(fake.calls).toHaveLength(1 + DUPLICATE_ATTEMPTS)
  })

  it('asks once more when the model could not hit the Bloom level', async () => {
    let asked = 0
    const fake = fakeGenerate((payload) => {
      asked += 1
      if (asked === 1) throw failure('BLOOM_ALIGNMENT_MISMATCH')
      return one(payload)
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['create'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(1)
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1].bloom_level).toBe('create')
  })

  it('drops the slot when the same level fails twice', async () => {
    const fake = fakeGenerate(() => {
      throw failure('BLOOM_ALIGNMENT_MISMATCH')
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['create'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(0)
    expect(outcome.skipped).toBe(1)
    expect(fake.calls).toHaveLength(2)
  })

  it('waits out a rate limit and carries on', async () => {
    let asked = 0
    const fake = fakeGenerate((payload) => {
      asked += 1
      if (asked === 1) throw failure('RATE_LIMIT_EXCEEDED', { retry_after: 0.001 })
      return one(payload)
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(1)
    expect(fake.calls).toHaveLength(2)
  })

  it('gives up on a rate limit that will not clear, and says so as a sentence', async () => {
    const fake = fakeGenerate(() => {
      throw failure('RATE_LIMIT_EXCEEDED', { retry_after: 0.001 })
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 1,
    })

    expect(outcome.questions).toHaveLength(0)
    expect(outcome.error).toBeTruthy()
    expect(outcome.error.data.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})

describe('a failure that stops the run', () => {
  it('stops on NO_CONTEXT, because no retry will find material', async () => {
    let asked = 0
    const fake = fakeGenerate((payload) => {
      asked += 1
      if (asked === 1) throw failure('NO_CONTEXT')
      return one(payload)
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Quantum computing',
      subject: 'general',
      blooms: ['apply'],
      count: 6,
    })

    expect(outcome.noContext).toBe(true)
    expect(outcome.questions.length).toBeLessThan(6)
    // Whatever arrived before the refusal is kept.
    expect(fake.calls.length).toBeLessThan(6)
  })

  it('stops on anything else and keeps the failure for the page to read', async () => {
    const fake = fakeGenerate(() => {
      throw failure('LLM_NOT_CONFIGURED')
    })

    const outcome = await runGeneration({
      generate: fake.generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply'],
      count: 6,
    })

    expect(outcome.questions).toHaveLength(0)
    expect(outcome.error.data.code).toBe('LLM_NOT_CONFIGURED')
  })
})

describe('Cancel', () => {
  it('stops the calls still out and keeps what already arrived', async () => {
    const controller = new AbortController()
    const pending = []
    let answered = 0

    const generate = (payload, { signal } = {}) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        pending.push({ payload, resolve: () => resolve(one(payload)) })
      })

    const run = runGeneration({
      generate,
      topic: 'Deadlocks',
      subject: 'OS',
      blooms: ['apply', 'analyze'],
      count: 6,
      signal: controller.signal,
    })

    // Let the two slots start, answer one of them, then cancel.
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    expect(pending).toHaveLength(MAX_IN_FLIGHT)
    pending[0].resolve()
    answered += 1
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    controller.abort()
    const outcome = await run

    expect(outcome.cancelled).toBe(true)
    expect(outcome.questions.length).toBe(answered)
    expect(outcome.questions.length).toBeLessThan(6)
  })
})

describe('a Retry-After as milliseconds', () => {
  it('reads the body, the error itself, then falls back', () => {
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED', { retry_after: 3 }))).toBe(3000)
    expect(retryAfterMs({ retryAfter: 2 })).toBe(2000)
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED'))).toBe(RATE_LIMIT_WAIT_MS)
  })

  it('will not sit out an absurd wait', () => {
    expect(retryAfterMs(failure('RATE_LIMIT_EXCEEDED', { retry_after: 600 }))).toBe(30_000)
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
      { topic: 'Deadlocks', conceptId: 'custom:deadlocks', bloom: 'understand', fallbackId: 'generated:custom:deadlocks:0' }
    )

    expect(mapped.type).toBe('short')
    expect(mapped.needsHumanCheck).toBe(true)
    expect(mapped.correctIndex).toBeUndefined()
    // The adapter refuses to invent a backend id; the session still needs a key.
    expect(mapped.question_id).toBe('generated:custom:deadlocks:0')
  })
})
