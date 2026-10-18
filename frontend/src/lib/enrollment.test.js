/**
 * enrollment — adding a course to My courses, changing its goal, and removing
 * it without touching anything else. One key per user.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  enroll,
  isEnrolled,
  listEnrolled,
  readEnrollments,
  unenroll,
  updateEnrollment,
} from './enrollment.js'

const USER = 'test-user'

describe('enroll', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('adds a course to My courses, with the moment it was added', () => {
    enroll(USER, 'os', { goal: 'Pass the exam', examDate: '2026-12-01' })

    expect(isEnrolled(USER, 'os')).toBe(true)
    expect(listEnrolled(USER)).toEqual([
      {
        courseId: 'os',
        enrolledAt: expect.any(String),
        goal: 'Pass the exam',
        examDate: '2026-12-01',
      },
    ])
  })

  it('enrols without a goal or an exam date', () => {
    enroll(USER, 'os')
    expect(listEnrolled(USER)[0]).toMatchObject({ courseId: 'os', goal: '', examDate: '' })
  })

  it('keeps one record per course when enrolled twice', () => {
    enroll(USER, 'os', { goal: 'First goal' })
    enroll(USER, 'os', { goal: 'A better goal' })

    const enrolled = listEnrolled(USER)
    expect(enrolled).toHaveLength(1)
    expect(enrolled[0].goal).toBe('A better goal')
  })

  it('keeps one user per key', () => {
    enroll(USER, 'os')
    enroll('other-user', 'dbms')

    expect(listEnrolled(USER).map((item) => item.courseId)).toEqual(['os'])
    expect(listEnrolled('other-user').map((item) => item.courseId)).toEqual(['dbms'])
  })

  it('refuses a course with no id', () => {
    expect(enroll(USER, '')).toBeNull()
    expect(readEnrollments(USER).courses).toEqual({})
  })
})

describe('unenroll', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('hides the course from My courses', () => {
    enroll(USER, 'os')
    unenroll(USER, 'os')

    expect(isEnrolled(USER, 'os')).toBe(false)
    expect(listEnrolled(USER)).toEqual([])
  })

  it('does nothing when the course was never enrolled', () => {
    unenroll(USER, 'os')
    expect(readEnrollments(USER).courses).toEqual({})
  })
})

describe('updateEnrollment', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('changes the goal and the exam date in place', () => {
    enroll(USER, 'os', { goal: 'Old', examDate: '2026-01-01' })
    updateEnrollment(USER, 'os', { goal: 'New', examDate: '2026-06-01' })

    expect(listEnrolled(USER)[0]).toMatchObject({ goal: 'New', examDate: '2026-06-01' })
  })

  it('clears a field when given an empty value', () => {
    enroll(USER, 'os', { goal: 'Something' })
    updateEnrollment(USER, 'os', { goal: '' })
    expect(listEnrolled(USER)[0].goal).toBe('')
  })

  it('refuses to update a course that is not in My courses', () => {
    expect(updateEnrollment(USER, 'os', { goal: 'Nope' })).toBeNull()
  })
})

describe('readEnrollments', () => {
  it('starts empty for a user with nothing stored', () => {
    expect(readEnrollments('nobody')).toEqual({ version: 1, courses: {} })
  })

  it('survives storage that is not the shape it wrote', () => {
    window.localStorage.setItem('qm_enrolled_test-user', '{not json')
    expect(readEnrollments(USER)).toEqual({ version: 1, courses: {} })
  })
})
