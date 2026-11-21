import { describe, expect, it, vi } from 'vitest'

vi.mock('../client.js', () => ({ apiFetch: vi.fn(async () => ({})) }))
vi.mock('../mocks/config.js', () => ({ isMocked: () => false, delay: async () => {} }))

import { apiFetch } from '../client.js'
import { profileApi } from './profile.js'

describe('profile endpoints', () => {
  it('does not call the nonexistent /next-question-params endpoint', async () => {
    expect(profileApi).not.toHaveProperty('getNextQuestionParams')

    await profileApi.getProfile('user-1')
    const calls = apiFetch.mock.calls.flat().join(' ')
    expect(calls).toContain('/profile/user-1')
    expect(calls).not.toContain('next-question-params')
  })
})
