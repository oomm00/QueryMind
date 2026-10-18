/**
 * saved — bookmarking a course, and the fact that saving and enrolling are
 * separate acts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { isSaved, listSaved, readSaved, toggleSaved } from './saved.js'

const USER = 'test-user'

describe('toggleSaved', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('adds a bookmark, then removes it', () => {
    expect(toggleSaved(USER, 'os')).toBe(true)
    expect(isSaved(USER, 'os')).toBe(true)
    expect(listSaved(USER)).toEqual(['os'])

    expect(toggleSaved(USER, 'os')).toBe(false)
    expect(isSaved(USER, 'os')).toBe(false)
    expect(listSaved(USER)).toEqual([])
  })

  it('keeps one user per key', () => {
    toggleSaved(USER, 'os')
    toggleSaved('other-user', 'networks')

    expect(listSaved(USER)).toEqual(['os'])
    expect(listSaved('other-user')).toEqual(['networks'])
  })

  it('refuses a course with no id', () => {
    expect(toggleSaved(USER, '')).toBe(false)
    expect(readSaved(USER).courseIds).toEqual([])
  })
})

describe('readSaved', () => {
  it('starts empty for a user with nothing stored', () => {
    expect(readSaved('nobody')).toEqual({ version: 1, courseIds: [] })
  })
})
