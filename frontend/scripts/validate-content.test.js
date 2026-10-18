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
  normalizeResourceUrl,
  readDocuments,
  topicWarnings,
  validateContent,
  validateDocuments,
} from './validate-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '__fixtures__')
const VALID = join(FIXTURES, 'valid')
const INVALID = join(FIXTURES, 'invalid')
const EMPTY = join(FIXTURES, 'empty')
const WARNINGS = join(FIXTURES, 'warnings')

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
      'invalid/unknown.json: is neither a topic (has "concepts" or "conceptIds"), a lesson (has "blocks") nor a concept (has "questions")'
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

describe('warnings', () => {
  const result = validateContent(WARNINGS)

  it('are not problems: a warned tree is still a valid tree', () => {
    expect(result.problems).toEqual([])
    expect(result.counts).toEqual({ concepts: 4, lessons: 0, questions: 5 })
    expect(result.files).toHaveLength(5)
  })

  it('come back per topic, with every line that topic earned', () => {
    expect(result.warnings).toHaveLength(1)

    const [group] = result.warnings
    expect(group.topic).toBe('warnings')

    const said = group.messages.join('\n')
    expect(said).toContain(
      '5 of 5 multiple-choice questions put the correct answer at index 0 (100%, over 60%)'
    )
    expect(said).toContain(
      'the correct option is the longest option in 4 of 5 multiple-choice questions (80%, over 60%)'
    )
    expect(said).toContain('resource https://example.com/shared-guide is on 3 concepts')
    expect(said).toContain(
      'question "warn-alpha-q1" may be generic: it repeats the concept title "Alpha basics"'
    )
  })

  it('say nothing about a small, tidy tree', () => {
    expect(validateContent(VALID).warnings).toEqual([])
  })

  it('leave a bank too small for a share to mean anything', () => {
    const documents = [
      {
        rel: 'small/topic.json',
        data: {
          concepts: {
            one: {
              id: 'one',
              title: 'Small one',
              questions: [1, 2, 3].map((n) => ({
                id: `small-q${n}`,
                type: 'mcq',
                prompt: `Which option does small question ${n} point at?`,
                options: ['a', 'b', 'c', 'd'],
                correctIndex: 0,
              })),
            },
          },
        },
      },
    ]

    expect(topicWarnings(documents)).toEqual([])
  })

  it('call a stem generic only when nothing makes it concrete', () => {
    const stem = (prompt) =>
      topicWarnings([
        {
          rel: 'stems/topic.json',
          data: {
            concepts: {
              one: {
                id: 'one',
                title: 'Paging basics',
                questions: [
                  { id: 'stem-q', type: 'mcq', prompt, options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
                ],
              },
            },
          },
        },
      ])

    expect(stem('Explain paging basics.')).toHaveLength(1)
    expect(stem('Explain paging basics for a 4 KiB page.')).toEqual([])
    expect(stem('Explain paging basics as `walk()`.')).toEqual([])
    expect(stem('If paging basics break, what happens?')).toEqual([])
  })

  it('count exactly two concepts as a coincidence, three as padding', () => {
    const pair = [
      {
        rel: 'pair/topic.json',
        data: {
          concepts: {
            one: { id: 'one', title: 'One', resources: [{ url: 'https://www.example.com/guide/' }] },
            two: { id: 'two', title: 'Two', resources: [{ url: 'https://example.com/guide' }] },
          },
        },
      },
    ]

    expect(topicWarnings(pair)).toEqual([])
  })
})

describe('normalizeResourceUrl', () => {
  it('drops www. and an ignored trailing slash, and changes nothing else', () => {
    expect(normalizeResourceUrl('https://www.example.com/guide/')).toBe('https://example.com/guide')
    expect(normalizeResourceUrl('https://example.com/guide')).toBe('https://example.com/guide')
    expect(normalizeResourceUrl('  https://example.com/guide//  ')).toBe('https://example.com/guide')
    expect(normalizeResourceUrl('https://example.com/guide?page=2')).toBe(
      'https://example.com/guide?page=2'
    )
    expect(
      normalizeResourceUrl('https://en.wikipedia.org/wiki/Kernel_%28operating_system%29')
    ).toBe('https://en.wikipedia.org/wiki/Kernel_%28operating_system%29')
    expect(normalizeResourceUrl('not a url')).toBe('not a url')
    expect(normalizeResourceUrl(null)).toBeNull()
  })
})

describe('concept files', () => {
  it('are validated like an inline concept, wherever the problem is', () => {
    const result = validateDocuments([
      { rel: 'topic/topic.json', data: { id: 'topic', title: 'Topic', conceptIds: ['one'] } },
      {
        rel: 'topic/concepts/one.json',
        data: {
          id: 'one',
          title: 'One',
          prerequisiteIds: ['ghost'],
          questions: [{ id: 'concept-q', type: 'mcq', options: ['a', 'b', 'c'], correctIndex: 0 }],
        },
      },
    ])

    expect(result.problems.join('\n').replace(/\\/g, '/')).toContain(
      'topic/concepts/one.json questions[0]: mcq "concept-q" needs exactly 4 options, found 3'
    )
    expect(normalised(result.problems)).toContain(
      'prerequisite "ghost" is not a concept in this content set'
    )
    expect(result.counts).toEqual({ concepts: 1, lessons: 0, questions: 1 })
  })

  it('want an id and a title, and a conceptIds list that is a list', () => {
    const result = validateDocuments([
      { rel: 'topic/topic.json', data: { id: 'topic', title: 'Topic', conceptIds: 'one' } },
      { rel: 'topic/concepts/spare.json', data: { summary: 'no id, no title' } },
    ])

    const said = normalised(result.problems)
    expect(said).toContain('topic/topic.json: conceptIds must be an array of concept ids')
    expect(said).toContain('topic/concepts/spare.json: concept is missing an id')
    expect(said).toContain('topic/concepts/spare.json: concept is missing a title')
  })

  it('cannot repeat a concept the topic already declares', () => {
    const result = validateDocuments([
      { rel: 'topic/topic.json', data: { concepts: { one: { id: 'one', title: 'One' } } } },
      { rel: 'topic/concepts/one.json', data: { id: 'one', title: 'One again' } },
    ])

    expect(normalised(result.problems)).toContain('concept id "one" is already used by topic/topic.json')
  })
})
