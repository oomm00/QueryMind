/**
 * enrollment — adding a course to My courses, and removing it again without
 * touching anything else. One key per user.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { enroll, isEnrolled, listEnrolled, readEnrollments, unenroll } from './enrollment.js'

const USER = 'test-user'

describe('enroll', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('adds a course to My courses, with the moment it was added', () => {
    enroll(USER, 'os')

    expect(isEnrolled(USER, 'os')).toBe(true)
    expect(listEnrolled(USER)).toEqual([{ courseId: 'os', enrolledAt: expect.any(String) }])
  })

  it('keeps one record per course when enrolled twice', () => {
    const first = enroll(USER, 'os')
    const second = enroll(USER, 'os')

    expect(listEnrolled(USER)).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('ignores a goal and an exam date an older record still carries', () => {
    window.localStorage.setItem(
      `qm_enrolled_${USER}`,
      JSON.stringify({
        version: 1,
        courses: {
          os: { enrolledAt: '2026-01-01T00:00:00.000Z', goal: 'Old goal', examDate: '2026-06-01' },
        },
      })
    )

    enroll(USER, 'os')

    expect(listEnrolled(USER)[0]).toMatchObject({
      courseId: 'os',
      enrolledAt: '2026-01-01T00:00:00.000Z',
    })
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

describe('readEnrollments', () => {
  it('starts empty for a user with nothing stored', () => {
    expect(readEnrollments('nobody')).toEqual({ version: 1, courses: {} })
  })

  it('survives storage that is not the shape it wrote', () => {
    window.localStorage.setItem('qm_enrolled_test-user', '{not json')
    expect(readEnrollments(USER)).toEqual({ version: 1, courses: {} })
  })
})
