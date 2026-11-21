/**
 * Generated answers go through the attempt endpoint. The id around that call
 * must survive a retry of the same answer; a mark that never arrived stays
 * unscored rather than turning into zero.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/endpoints/attempts.js', () => ({
  attemptsApi: { submit: vi.fn() },
}))

import { attemptsApi } from '../api/endpoints/attempts.js'
import { gradeGeneratedAnswer } from './generateGrading.js'
import { clearSubmissionId, getSubmissionId } from './submissionId.js'

const question = { question_id: 'q1', origin: 'generated' }

beforeEach(() => {
  sessionStorage.clear()
  attemptsApi.submit.mockReset()
  attemptsApi.submit.mockResolvedValue({ score: 0.8, feedback_text: 'Marked.' })
})

describe('gradeGeneratedAnswer', () => {
  it('submits a stable submission_id that a second call reuses', async () => {
    await gradeGeneratedAnswer(question, 'my answer', 'user-1')
    await gradeGeneratedAnswer(question, 'my answer', 'user-1')

    expect(attemptsApi.submit).toHaveBeenCalledTimes(2)
    const [first, second] = attemptsApi.submit.mock.calls.map(([payload]) => payload)
    expect(first.submission_id).toEqual(expect.any(String))
    expect(first.submission_id.length).toBeGreaterThan(0)
    expect(second.submission_id).toBe(first.submission_id)
    expect(attemptsApi.submit.mock.calls[0][1]).toBe('user-1')
  })

  it('uses a different id once the answer changes', async () => {
    await gradeGeneratedAnswer(question, 'answer A', 'user-1')
    await gradeGeneratedAnswer(question, 'answer B', 'user-1')

    const ids = attemptsApi.submit.mock.calls.map(([payload]) => payload.submission_id)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('honours a cleared id for a fresh submission', async () => {
    await gradeGeneratedAnswer(question, 'my answer', 'user-1')
    const original = attemptsApi.submit.mock.calls[0][0].submission_id
    clearSubmissionId('q1', 'my answer')

    await gradeGeneratedAnswer(question, 'my answer', 'user-1')
    expect(attemptsApi.submit.mock.calls[1][0].submission_id).not.toBe(original)
    expect(getSubmissionId('q1', 'my answer')).toBe(attemptsApi.submit.mock.calls[1][0].submission_id)
  })

  it('leaves a mark that never arrived unscored, not zero', async () => {
    attemptsApi.submit.mockResolvedValue({ feedback_text: 'Could not grade.' })

    expect(await gradeGeneratedAnswer(question, 'my answer', 'user-1')).toBeNull()
  })
})
