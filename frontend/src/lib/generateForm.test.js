/**
 * The rules behind the "Pick a topic" form, without a browser: which Bloom levels
 * a difficulty starts with, how a typed topic becomes an id, how it is matched
 * against what the student uploaded, and how a backend score becomes a share.
 */

import { describe, expect, it } from 'vitest'
import {
  GENERATE_COUNT_CHOICES,
  GENERAL_SUBJECT,
  bloomsForDifficulty,
  customConceptId,
  difficultyLabel,
  editDistance,
  findTopicSuggestion,
  isCloseTopic,
  matchingSuggestions,
  normaliseTopic,
  slugifyTopic,
  subjectForTopic,
  topicSuggestions,
} from './generateForm.js'
import { normaliseScore } from './generateRun.js'

describe('difficulty is a Bloom band', () => {
  it('starts easy on remember and understand, and hard on evaluate and create', () => {
    expect(bloomsForDifficulty('easy')).toEqual(['remember', 'understand'])
    expect(bloomsForDifficulty('medium')).toEqual(['apply', 'analyze'])
    expect(bloomsForDifficulty('hard')).toEqual(['evaluate', 'create'])
  })

  it('gives mixed every level, in taxonomy order', () => {
    expect(bloomsForDifficulty('mixed')).toEqual([
      'remember',
      'understand',
      'apply',
      'analyze',
      'evaluate',
      'create',
    ])
  })

  it('labels the four difficulties in the order they are shown', () => {
    expect(['easy', 'medium', 'hard', 'mixed'].map(difficultyLabel)).toEqual([
      'Easy',
      'Medium',
      'Hard',
      'Mixed',
    ])
  })

  it('offers no more than 10 questions', () => {
    expect(GENERATE_COUNT_CHOICES).toEqual([6, 10])
  })
})

describe('a typed topic as an id', () => {
  it('slugs what was typed, so the same topic always files under the same id', () => {
    expect(slugifyTopic('Deadlock Detection!')).toBe('deadlock-detection')
    expect(slugifyTopic('  Banker’s Algorithm ')).toBe('banker-s-algorithm')
    expect(slugifyTopic('Memory   Management')).toBe('memory-management')
  })

  it('files mastery under custom:<slug>', () => {
    expect(customConceptId('Deadlocks')).toBe('custom:deadlocks')
    expect(customConceptId('Deadlock Detection')).toBe('custom:deadlock-detection')
  })

  it('has no id for a topic that is only punctuation', () => {
    expect(customConceptId('!!!')).toBeNull()
    expect(customConceptId('')).toBeNull()
  })
})

describe('matching what was typed against what exists', () => {
  it('ignores case and word separators', () => {
    expect(normaliseTopic('Virtual Memory!')).toBe('virtual memory')
    expect(isCloseTopic('virtual-memory', 'Virtual Memory')).toBe(true)
  })

  it('treats a singular and a plural as the same word', () => {
    expect(isCloseTopic('Deadlock', 'Deadlocks')).toBe(true)
    expect(isCloseTopic('Paging', 'Paging algorithms')).toBe(false)
  })

  it('counts a near miss as a typo', () => {
    expect(editDistance('deadlock', 'deadlocks')).toBe(1)
    expect(editDistance('deadlok', 'deadlocks')).toBe(2)
    expect(isCloseTopic('Deadlok', 'Deadlocks')).toBe(true)
    expect(isCloseTopic('Semaphores', 'Deadlocks')).toBe(false)
  })

  it('suggests the uploaded topic for a singular or a typo, and nothing otherwise', () => {
    const uploaded = ['Deadlocks', 'Transactions', 'Memory Management']

    expect(findTopicSuggestion('Deadlock', uploaded)).toBe('Deadlocks')
    expect(findTopicSuggestion('deadloks', uploaded)).toBe('Deadlocks')
    expect(findTopicSuggestion('Deadlocks', uploaded)).toBe('Deadlocks')
    expect(findTopicSuggestion('Quantum computing', uploaded)).toBeNull()
    expect(findTopicSuggestion('', uploaded)).toBeNull()
  })

  it('takes the subject from the document the topic matched, else general', () => {
    const rows = [
      { subject: 'OS', topics: ['Deadlocks'] },
      { subject: 'DBMS', topics: ['Transactions'] },
    ]

    expect(subjectForTopic('Deadlocks', rows)).toBe('OS')
    expect(subjectForTopic('deadlock', rows)).toBe('OS')
    expect(subjectForTopic('Transactions', rows)).toBe('DBMS')
    expect(subjectForTopic('Quantum computing', rows)).toBe(GENERAL_SUBJECT)
    expect(subjectForTopic('Deadlocks', [])).toBe(GENERAL_SUBJECT)
  })
})

describe('the suggestions under the topic field', () => {
  it('puts the student’s own uploads first and drops duplicates', () => {
    expect(
      topicSuggestions({
        documentTopics: ['Deadlocks'],
        conceptTitles: ['Deadlocks', 'Paging', ''],
      })
    ).toEqual(['Deadlocks', 'Paging'])
  })

  it('matches as the student types, preferring the ones that start with it', () => {
    const all = ['Memory Management', 'Memory Paging', 'Deadlocks']
    expect(matchingSuggestions('mem', all)).toEqual(['Memory Management', 'Memory Paging'])
    expect(matchingSuggestions('dead', all)).toEqual(['Deadlocks'])
    expect(matchingSuggestions('', all)).toEqual(all)
  })
})

describe('a backend score as a share of one', () => {
  it('leaves a share alone and divides a percentage down', () => {
    expect(normaliseScore(0.5)).toBe(0.5)
    expect(normaliseScore(1)).toBe(1)
    expect(normaliseScore(75)).toBe(0.75)
    expect(normaliseScore(100)).toBe(1)
  })

  it('clamps rather than trusting the server', () => {
    expect(normaliseScore(150)).toBe(1)
    expect(normaliseScore(-4)).toBe(0)
  })

  it('has nothing to say about a score that is not a number', () => {
    expect(normaliseScore(undefined)).toBeNull()
    expect(normaliseScore('high')).toBeNull()
    expect(normaliseScore(null)).toBeNull()
  })
})
