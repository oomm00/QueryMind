/**
 * validate-content — the content gate, tested against fixture trees.
 *
 * A fixture tree that satisfies every rule must come back clean, and each rule
 * that exists must fail loudly on the fixture that breaks it. The real content
 * is checked last, so a broken content file fails the test suite too.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CONTENT_ROOT,
  bannedPhraseProblems,
  readDocuments,
  validateContent,
  validateDocuments,
} from './validate-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '__fixtures__')
const VALID = join(FIXTURES, 'valid')
const INVALID = join(FIXTURES, 'invalid')
const EMPTY = join(FIXTURES, 'empty')

/** Problems come back with the platform's separators; compare on one form. */
function normalised(problems) {
  return problems.join('\n').replace(/\\/g, '/')
}

function expectProblem(problems, fragment) {
  expect(normalised(problems)).toContain(fragment)
}

describe('a valid tree', () => {
  const result = validateContent(VALID)

  it('has nothing to report', () => {
    expect(result.problems).toEqual([])
  })

  it('counts what it read', () => {
    expect(result.files).toHaveLength(2)
    expect(result.counts).toEqual({ concepts: 2, lessons: 1, questions: 3 })
  })
})

describe('an invalid tree', () => {
  const { problems, counts } = validateContent(INVALID)

  it('reports every rule the fixture breaks', () => {
    expect(problems.length).toBeGreaterThan(0)

    // wording
    expectProblem(problems, 'invalid/topic.json (title): contains banned phrase "TODO"')

    // JSON and document kind
    expectProblem(problems, 'invalid/broken.json: invalid JSON')
    expectProblem(
      problems,
      'invalid/unknown.json: is neither a topic (has "concepts") nor a lesson (has "blocks")'
    )

    // concepts
    expectProblem(problems, 'invalid/topic.json concepts.third-concept: concept is missing a title')
    expectProblem(
      problems,
      'invalid/topic.json concepts.second-concept: concept id "first-concept" is already used by invalid/topic.json'
    )
    expectProblem(
      problems,
      'invalid/topic.json concepts.first-concept: prerequisite "ghost-concept" is not a concept in this content set'
    )

    // resources
    expectProblem(problems, 'at most 3')
    expectProblem(
      problems,
      'resources[0]: resource url "http://example.com/wrong-scheme" must be an https:// URL'
    )
    expectProblem(
      problems,
      'resources[0]: resource type "paper" is not one of article, video, book, docs, interactive, notes'
    )
    expectProblem(problems, 'resources[0]: resource estMinutes "0" must be a positive number')
    expectProblem(
      problems,
      'resources[0]: resource verifiedOn "1 September 2026" must be an ISO date (YYYY-MM-DD)'
    )

    // mcq
    expectProblem(problems, 'mcq "fixture-mcq-few" needs exactly 4 options, found 3')
    expectProblem(problems, 'mcq "fixture-mcq" has duplicate options')
    expectProblem(problems, 'mcq "fixture-mcq" correctIndex "9" is not one of its options')

    // short answer
    expectProblem(problems, 'short question "fixture-short" needs an answerKey')
    expectProblem(problems, 'short question "fixture-short" needs a rubric')

    // lesson
    expectProblem(problems, 'invalid/lesson.json: lesson is missing an id')
    expectProblem(problems, 'invalid/lesson.json: lesson is missing a title')
    expectProblem(
      problems,
      'invalid/lesson.json blocks[1]: question id "fixture-check" is already used by invalid/lesson.json blocks[0]'
    )
    expectProblem(problems, 'mcq "fixture-check" correctIndex "4" is not one of its options')
  })

  it('still counts what it did manage to read', () => {
    expect(counts).toEqual({ concepts: 2, lessons: 0, questions: 4 })
  })
})

describe('a folder with no content', () => {
  it('says so instead of passing quietly', () => {
    const result = validateContent(EMPTY)
    expect(result.files).toEqual([])
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toContain('no .json files found under')
  })

  it('reports a root it cannot read', () => {
    const result = validateContent(join(FIXTURES, 'no-such-folder'))
    expect(result.problems[0]).toContain('cannot read')
  })
})

describe('the shipped content', () => {
  const result = validateContent(CONTENT_ROOT)

  it('passes its own gate', () => {
    expect(result.problems).toEqual([])
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.counts.concepts).toBeGreaterThan(0)
  })
})

describe('validateDocuments', () => {
  it('validates documents that are already parsed, with no filesystem', () => {
    const result = validateDocuments([
      {
        rel: 'memory/topic.json',
        data: {
          concepts: {
            one: { id: 'one', title: 'One', questions: [{ id: 'q', type: 'mcq' }] },
          },
        },
      },
      {
        rel: 'memory/lesson.json',
        data: {
          id: 'lesson',
          title: 'Lesson',
          blocks: [{ kind: 'check', id: 'q', prompt: 'Also q' }],
        },
      },
    ])

    expect(result.counts).toEqual({ concepts: 1, lessons: 1, questions: 1 })
    expect(normalised(result.problems)).toContain('question id "q" is already used by')
  })
})

describe('readDocuments', () => {
  it('scans wording before structure, and keeps every parsed document', () => {
    const { documents, problems } = readDocuments(INVALID)
    expect(documents).toHaveLength(3)
    expect(problems.length).toBeGreaterThan(0)
  })
})

describe('bannedPhraseProblems', () => {
  it('finds a drafting phrase wherever it hides, whatever its case', () => {
    const problems = bannedPhraseProblems('topic.json', {
      title: 'Fine',
      concepts: { one: { summary: 'Wait, this is still a draft' } },
      notes: ['let me recalculate the offset'],
    })

    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('concepts.one.summary')
    expect(problems[1]).toContain('notes[0]')
  })

  it('has nothing to say about written content', () => {
    expect(bannedPhraseProblems('topic.json', { title: 'Paging', blocks: [] })).toEqual([])
  })
})
