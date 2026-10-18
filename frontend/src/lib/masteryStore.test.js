/**
 * masteryStore — the one write path into mastery, and the storage rules around
 * it: one key per user, one sample per answered question, and nothing invented
 * when the stored JSON is unreadable.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { readProgress, recordScore, resetMastery } from './masteryStore.js'

const KEY = 'qm_progress_test-user'

function stored(userId = 'test-user') {
  return JSON.parse(window.localStorage.getItem(`qm_progress_${userId}`) || 'null')
}

describe('recordScore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('writes the first score as it is, under the user own key', () => {
    const entry = recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 1 })

    expect(entry).toEqual({
      value: 1,
      count: 1,
      updatedAt: expect.any(String),
    })
    expect(stored()).toEqual({
      version: 1,
      concepts: { paging: { understand: entry } },
    })
  })

  it('moves the value towards each later score and counts it', () => {
    recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 1 })
    const second = recordScore('test-user', {
      conceptId: 'paging',
      bloom: 'understand',
      score: 0,
    })

    expect(second.value).toBeCloseTo(0.7, 10)
    expect(second.count).toBe(2)
    expect(readProgress('test-user').concepts.paging.understand.value).toBeCloseTo(0.7, 10)
  })

  it('keeps one concept per Bloom level, and one user per key', () => {
    recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 1 })
    recordScore('test-user', { conceptId: 'paging', bloom: 'apply', score: 0 })
    recordScore('other-user', { conceptId: 'paging', bloom: 'understand', score: 0.5 })

    const mine = readProgress('test-user').concepts.paging
    expect(Object.keys(mine).sort()).toEqual(['apply', 'understand'])
    expect(mine.apply.value).toBe(0)
    expect(readProgress('other-user').concepts.paging.understand.value).toBe(0.5)
    expect(stored('other-user').concepts.paging.apply).toBeUndefined()
  })

  it('clamps a score that is outside 0–1', () => {
    const high = recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 5 })
    expect(high.value).toBe(1)
  })

  it('records a genuine zero as a real answer', () => {
    const entry = recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 0 })
    expect(entry.value).toBe(0)
    expect(entry.count).toBe(1)
    expect(readProgress('test-user').concepts.paging.understand.count).toBe(1)
  })

  it('refuses an answer with no concept or no Bloom level', () => {
    expect(recordScore('test-user', { bloom: 'understand', score: 1 })).toBeNull()
    expect(recordScore('test-user', { conceptId: 'paging', score: 1 })).toBeNull()
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })
})

describe('readProgress', () => {
  it('starts empty for a user with nothing stored', () => {
    expect(readProgress('nobody')).toEqual({ version: 1, concepts: {} })
  })

  it('survives storage that is not the shape it wrote', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(readProgress('test-user')).toEqual({ version: 1, concepts: {} })

    window.localStorage.setItem(KEY, JSON.stringify({ version: 1 }))
    expect(readProgress('test-user')).toEqual({ version: 1, concepts: {} })
  })
})

describe('resetMastery', () => {
  it('removes the user own progress', () => {
    recordScore('test-user', { conceptId: 'paging', bloom: 'understand', score: 1 })
    recordScore('other-user', { conceptId: 'paging', bloom: 'understand', score: 1 })

    resetMastery('test-user')

    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(stored('other-user')).not.toBeNull()
  })
})
