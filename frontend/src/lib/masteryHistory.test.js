/**
 * masteryHistory — the daily snapshot, written beside the mastery it describes.
 *
 * The days are the same means the pages show, so a snapshot cannot drift from
 * the store: one row per local date, rewritten whenever an answer moves a value,
 * and only the last 180 days kept.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { historyDate, historyFor, readHistory, recordMasterySnapshot, resetHistory } from './masteryHistory.js'
import { recordScore } from './masteryStore.js'
import { estimatesFrom } from './mastery.js'

const USER = 'history-user'

beforeEach(() => {
  window.localStorage.clear()
  resetHistory(USER)
})

describe('historyDate', () => {
  it('is the local calendar date', () => {
    expect(historyDate(new Date(2026, 9, 18, 23, 30).getTime())).toBe('2026-10-18')
    expect(historyDate(new Date(2026, 0, 2, 0, 5).getTime())).toBe('2026-01-02')
  })
})

describe('recordMasterySnapshot', () => {
  it('writes one row for the day, with concept, subject and course means', () => {
    // A real concept, so the subject and course roll-ups have something to cover.
    const conceptId = 'os-fundamentals-kernel-responsibilities'
    const when = new Date(2026, 9, 18, 10, 0).getTime()
    const concepts = { [conceptId]: { apply: { value: 0.8, count: 2 } } }

    const snapshot = recordMasterySnapshot(USER, concepts, when)

    expect(snapshot.date).toBe('2026-10-18')
    expect(snapshot.concepts[conceptId]).toBeCloseTo(0.8, 10)
    expect(Object.values(snapshot.subjects)).toEqual([0.8])
    expect(Object.values(snapshot.courses)).toEqual([0.8])
    expect(historyFor(USER, '2026-10-18')).toMatchObject({
      concepts: snapshot.concepts,
      subjects: snapshot.subjects,
      courses: snapshot.courses,
    })
  })

  it('rewrites the day rather than appending to it', () => {
    const when = new Date(2026, 9, 18, 10, 0).getTime()
    recordMasterySnapshot(USER, { paging: { apply: { value: 0.2, count: 1 } } }, when)
    recordMasterySnapshot(USER, { paging: { apply: { value: 0.9, count: 2 } } }, when)

    const days = readHistory(USER).days
    expect(Object.keys(days)).toEqual(['2026-10-18'])
    expect(days['2026-10-18'].concepts.paging).toBeCloseTo(0.9, 10)
  })

  it('leaves a concept with no answers out rather than calling it zero', () => {
    const when = new Date(2026, 9, 18, 10, 0).getTime()
    const snapshot = recordMasterySnapshot(USER, { untouched: { apply: { count: 0 } } }, when)
    expect(snapshot.concepts).toEqual({})
  })

  it('keeps 180 days and drops the oldest', () => {
    const day = 24 * 60 * 60 * 1000
    for (let index = 0; index < 185; index += 1) {
      recordMasterySnapshot(USER, { paging: { apply: { value: 0.5, count: 1 } } }, Date.UTC(2026, 0, 1) + index * day)
    }

    const dates = Object.keys(readHistory(USER).days).sort()
    expect(dates).toHaveLength(180)
    expect(dates[0]).toBe(historyDate(Date.UTC(2026, 0, 1) + 5 * day))
  })
})

describe('recordScore', () => {
  it('snapshots the day whenever a value moves', () => {
    const conceptId = 'os-fundamentals-kernel-responsibilities'
    recordScore(USER, { conceptId, bloom: 'apply', score: 1 })

    const today = historyFor(USER)
    expect(today).not.toBeNull()
    expect(today.concepts[conceptId]).toBe(1)
    // The snapshot's means are the store's means.
    const estimates = estimatesFrom({ [conceptId]: { apply: { value: 1, count: 1 } } })
    expect(today.concepts[conceptId]).toBe(estimates[conceptId].value)
  })
})
