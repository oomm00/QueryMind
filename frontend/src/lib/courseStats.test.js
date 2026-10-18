import { describe, it, expect } from 'vitest'
import { courseStats, lastPractised } from './courseStats.js'

const tree = {
  id: 'os',
  topics: [
    {
      id: 'processes',
      title: 'Processes',
      concepts: [
        { id: 'process-lifecycle', title: 'Process lifecycle', questions: [{ question_id: 'q1' }, { question_id: 'q2' }] },
        { id: 'scheduling', title: 'Scheduling', questions: [{ question_id: 'q3' }] },
      ],
    },
    {
      id: 'memory',
      title: 'Memory management',
      concepts: [{ id: 'paging', title: 'Paging', questions: [] }],
    },
  ],
}

const progress = {
  concepts: {
    'process-lifecycle': { apply: { value: 0.8, count: 2 } },
    paging: { remember: { value: 1, count: 1 } },
    // A concept from another course: it must not count towards this one.
    'other-course-concept': { remember: { value: 0.2, count: 9 } },
  },
}

describe('courseStats', () => {
  it('counts concepts, questions, coverage, answers and mastery', () => {
    const stats = courseStats(tree, progress)

    expect(stats.concepts).toBe(3)
    expect(stats.questions).toBe(3)
    expect(stats.practised).toBe(2)
    expect(stats.coverage).toBeCloseTo(2 / 3)
    expect(stats.answers).toBe(3)
    expect(stats.mastery.value).toBeCloseTo(0.9)
    expect(stats.mastery.basedOn).toBe(2)
    expect(stats.mastery.of).toBe(3)
  })

  it('reports no content as null rather than zeros', () => {
    expect(courseStats(null, progress)).toBeNull()
  })

  it('says nothing is measured when no concept has an answer', () => {
    const stats = courseStats(tree, { concepts: {} })

    expect(stats.practised).toBe(0)
    expect(stats.answers).toBe(0)
    expect(stats.mastery).toBeNull()
  })
})

describe('lastPractised', () => {
  const at = (iso, extra = {}) => ({
    courseId: 'os',
    scope: 'course',
    scopeId: 'processes',
    createdAt: iso,
    answers: {},
    ...extra,
  })

  it('is null when the course has no sessions', () => {
    expect(lastPractised(tree, [], 'os')).toBeNull()
    expect(lastPractised(tree, [{ courseId: 'dbms', createdAt: '2026-10-18T09:00:00Z' }], 'os')).toBeNull()
  })

  it('names the topic the newest answered session drew from', () => {
    const last = lastPractised(
      tree,
      [at('2026-10-18T09:00:00Z', { answers: { q1: { selected: 1 } } })],
      'os'
    )

    expect(last.title).toBe('Processes')
    expect(last.kind).toBe('topic')
  })

  it('names the concept when the session was concept scoped', () => {
    const last = lastPractised(
      tree,
      [at('2026-10-18T09:00:00Z', { scope: 'concept', scopeId: 'paging', answers: { q1: { selected: 0 } } })],
      'os'
    )

    expect(last.title).toBe('Paging')
    expect(last.kind).toBe('concept')
  })

  it('prefers a session with an answer over a newer empty one', () => {
    const last = lastPractised(
      tree,
      [
        at('2026-10-18T11:00:00Z'),
        at('2026-10-18T10:00:00Z', { answers: { q1: { selected: 1 } } }),
      ],
      'os'
    )

    expect(last.at).toBe('2026-10-18T10:00:00Z')
  })

  it('leaves the title null when the scope is no longer in the content', () => {
    const last = lastPractised(
      tree,
      [at('2026-10-18T09:00:00Z', { scopeId: 'gone', answers: { q1: { selected: 1 } } })],
      'os'
    )

    expect(last.title).toBeNull()
  })
})
