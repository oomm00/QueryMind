/**
 * mastery — the arithmetic behind an estimate, and the rules that are not
 * arithmetic: a missing score is missing, and a concept with nothing answered
 * has no estimate rather than 0%.
 */

import { describe, expect, it } from 'vitest'
import {
  CONFIDENCE_LEVELS,
  NEW_SCORE_WEIGHT,
  addScore,
  clamp01,
  confidenceFor,
  estimateFor,
  estimatesFrom,
  rollUp,
  updateValue,
} from './mastery.js'

describe('clamp01', () => {
  it('keeps a score inside 0–1', () => {
    expect(clamp01(0)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(2.5)).toBe(1)
    expect(clamp01(-3)).toBe(0)
  })

  it('treats a missing value as missing, not as zero', () => {
    expect(clamp01(null)).toBeNull()
    expect(clamp01(undefined)).toBeNull()
    expect(clamp01('')).toBeNull()
    expect(clamp01('not a number')).toBeNull()
  })
})

describe('updateValue', () => {
  it('takes the first score as it is', () => {
    expect(updateValue(null, 1)).toBe(1)
    expect(updateValue(null, 0)).toBe(0)
    expect(updateValue(undefined, 0.5)).toBe(0.5)
  })

  it('keeps most of the old value when a score lands on it', () => {
    const next = updateValue(1, 0)
    expect(next).toBeCloseTo(1 - NEW_SCORE_WEIGHT, 10)
    expect(updateValue(0, 1)).toBeCloseTo(NEW_SCORE_WEIGHT, 10)
    expect(updateValue(0.5, 0.5)).toBeCloseTo(0.5, 10)
  })

  it('ignores a score that is not a number', () => {
    expect(updateValue(0.4, null)).toBe(0.4)
    expect(updateValue(0.4, 'x')).toBe(0.4)
  })
})

describe('addScore', () => {
  it('counts one answer and keeps the newest time', () => {
    const first = addScore(undefined, 1, 0)
    expect(first).toEqual({
      value: 1,
      count: 1,
      updatedAt: new Date(0).toISOString(),
    })

    const second = addScore(first, 0, 60_000)
    expect(second.value).toBeCloseTo(0.7, 10)
    expect(second.count).toBe(2)
    expect(second.updatedAt).toBe(new Date(60_000).toISOString())
  })

  it('refuses to record nothing', () => {
    expect(addScore(undefined, null)).toBeNull()
    expect(addScore(undefined, NaN)).toBeNull()
  })
})

describe('confidenceFor', () => {
  it('is null with no answers and steps by evidence', () => {
    expect(confidenceFor(0)).toBeNull()
    expect(confidenceFor(undefined)).toBeNull()
    expect(confidenceFor(1).label).toBe('Low')
    expect(confidenceFor(2).label).toBe('Low')
    expect(confidenceFor(3).label).toBe('Moderate')
    expect(confidenceFor(7).label).toBe('Moderate')
    expect(confidenceFor(8).label).toBe('High')
    expect(confidenceFor(40).label).toBe('High')
  })

  it('lists the bands from the most to the least evidence', () => {
    const mins = CONFIDENCE_LEVELS.map((level) => level.min)
    expect(mins).toEqual([...mins].sort((a, b) => b - a))
  })
})

describe('estimateFor', () => {
  it('has no estimate at all for a concept with nothing answered', () => {
    expect(estimateFor(undefined)).toBeNull()
    expect(estimateFor(null)).toBeNull()
    expect(estimateFor({})).toBeNull()
    expect(estimateFor({ understand: { value: null, count: 0 } })).toBeNull()
  })

  it('averages the Bloom levels attempted and sums their answers', () => {
    const estimate = estimateFor({
      understand: { value: 1, count: 2, updatedAt: new Date(0).toISOString() },
      apply: { value: 0.5, count: 3, updatedAt: new Date(1000).toISOString() },
    })

    expect(estimate.value).toBeCloseTo(0.75, 10)
    expect(estimate.count).toBe(5)
    expect(estimate.bloomCount).toBe(2)
    expect(estimate.bloomValues).toEqual({ understand: 1, apply: 0.5 })
    expect(estimate.confidence.label).toBe('Moderate')
    expect(estimate.updatedAt).toBe(new Date(1000).toISOString())
  })

  it('reports a real zero when every Bloom level scored zero', () => {
    const estimate = estimateFor({ understand: { value: 0, count: 1 } })
    expect(estimate.value).toBe(0)
    expect(estimate.confidence.label).toBe('Low')
  })
})

describe('estimatesFrom', () => {
  it('keeps only the concepts that have an estimate', () => {
    const estimates = estimatesFrom({
      practised: { understand: { value: 0.8, count: 4 } },
      empty: {},
    })
    expect(Object.keys(estimates)).toEqual(['practised'])
    expect(estimates.practised.value).toBe(0.8)
  })
})

describe('rollUp', () => {
  it('covers only the concepts with an estimate, and says how many of how many', () => {
    const estimates = {
      a: { value: 1, count: 2 },
      b: { value: 0.5, count: 4 },
    }
    const roll = rollUp(estimates, ['a', 'b', 'c'])
    expect(roll.value).toBeCloseTo(0.75, 10)
    expect(roll.count).toBe(6)
    expect(roll.basedOn).toBe(2)
    expect(roll.of).toBe(3)
    expect(roll.confidence.label).toBe('Moderate')
  })

  it('is null when none of the concepts has an estimate', () => {
    expect(rollUp({}, ['a', 'b'])).toBeNull()
    expect(rollUp({ a: {} }, ['a'])).toBeNull()
    expect(rollUp({}, [])).toBeNull()
  })
})
