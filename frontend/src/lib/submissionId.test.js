import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSubmissionId, getSubmissionId } from './submissionId.js'

describe('getSubmissionId', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.spyOn(globalThis.crypto, 'randomUUID')
  })

  it('uses crypto.randomUUID()', () => {
    getSubmissionId('q1', 'my answer')
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('reuses the same id on retry / double-click / remount', () => {
    const first = getSubmissionId('q1', 'my answer')
    const second = getSubmissionId('q1', 'my answer')
    const third = getSubmissionId('q1', 'my answer')
    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('creates a new id for a different answer or question', () => {
    const a = getSubmissionId('q1', 'answer A')
    const b = getSubmissionId('q1', 'answer B')
    const c = getSubmissionId('q2', 'answer A')
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('can be cleared for a fresh submission', () => {
    const first = getSubmissionId('q1', 'my answer')
    clearSubmissionId('q1', 'my answer')
    expect(getSubmissionId('q1', 'my answer')).not.toBe(first)
  })
})
