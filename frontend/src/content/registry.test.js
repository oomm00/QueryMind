/**
 * registry — one library, one record per concept.
 *
 * The fixture is deliberately two courses: course A defines a concept, course B
 * lists it under `conceptRefs`. Practising it from either course writes the
 * same (userId, conceptId, bloom) record, so both courses must show the same
 * estimate. Nothing here knows which course a click came from, which is the
 * point.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  allConcepts,
  coursesContaining,
  createRegistry,
  getConcept,
  getKnowledgeNodes,
  registerCustomConcept,
  registry,
  resetCustomConcepts,
  subjectLabel,
  subjects,
  topicsOfSubject,
} from './registry.js'
import { estimatesFrom } from '../lib/mastery.js'
import { readProgress, recordScore, resetMastery } from '../lib/masteryStore.js'

const SHARED = {
  id: 'shared-concept',
  title: 'Shared concept',
  subject: 'operating-systems',
  questions: [],
}

function twoCourses() {
  return createRegistry([
    {
      id: 'course-a',
      title: 'Course A',
      subject: 'operating-systems',
      topics: [
        {
          id: 'topic-a',
          title: 'Topic A',
          subject: 'operating-systems',
          concepts: [SHARED],
        },
      ],
    },
    {
      id: 'course-b',
      title: 'Course B',
      subject: 'operating-systems',
      topics: [
        {
          id: 'topic-b',
          title: 'Topic B',
          subject: 'operating-systems',
          conceptRefs: ['shared-concept'],
        },
      ],
    },
  ])
}

describe('createRegistry', () => {
  it('resolves a conceptRef to the concept another course defines, once', () => {
    const library = twoCourses()

    expect(library.problems).toEqual([])
    expect(library.allConcepts()).toHaveLength(1)
    expect(library.coursesContaining('shared-concept')).toEqual(['course-a', 'course-b'])
    expect(library.getConcept('shared-concept')).toMatchObject({
      id: 'shared-concept',
      subject: 'operating-systems',
      subjectLabel: 'Operating Systems',
    })
  })

  it('reports a duplicate id and a ref that points at nothing', () => {
    const duplicate = createRegistry([
      {
        id: 'course',
        title: 'Course',
        topics: [
          {
            id: 'topic',
            title: 'Topic',
            subject: 'operating-systems',
            concepts: [SHARED],
          },
          {
            id: 'topic-two',
            title: 'Topic two',
            subject: 'operating-systems',
            concepts: [SHARED],
          },
        ],
      },
    ])
    expect(duplicate.problems).toContain('duplicate concept id: shared-concept')

    const missingRef = createRegistry([
      {
        id: 'course',
        title: 'Course',
        topics: [
          {
            id: 'topic',
            title: 'Topic',
            subject: 'operating-systems',
            conceptRefs: ['ghost-concept'],
          },
        ],
      },
    ])
    expect(missingRef.problems).toEqual(['conceptRef not found: ghost-concept (in course/topic)'])
  })

  it('groups topics under the subject their concepts carry', () => {
    const library = twoCourses()
    expect(library.subjects()).toEqual(['operating-systems'])
    expect(library.topicsOfSubject('operating-systems').map((topic) => topic.id)).toEqual([
      'topic-a',
      'topic-b',
    ])
    expect(library.topicsOfSubject('mathematics')).toEqual([])
  })
})

describe('one shared mastery record', () => {
  const userId = 'registry-shared-mastery'
  let library

  beforeEach(() => {
    resetMastery(userId)
    library = twoCourses()
  })

  it('moves one record whether the answer came from course A, course B or the board', () => {
    // "From course A": the answer names the concept, nothing else.
    recordScore(userId, { conceptId: 'shared-concept', bloom: 'apply', score: 0.8 })
    // "From course B": the same concept id, still nothing about a course.
    recordScore(userId, { conceptId: 'shared-concept', bloom: 'apply', score: 0.5 })

    const progress = readProgress(userId)
    expect(Object.keys(progress.concepts)).toEqual(['shared-concept'])
    expect(Object.keys(progress.concepts['shared-concept'])).toEqual(['apply'])

    const estimates = estimatesFrom(progress.concepts)
    const a = library.courseMastery(estimates, 'course-a')
    const b = library.courseMastery(estimates, 'course-b')

    expect(a.value).not.toBeNull()
    expect(a.value).toBe(b.value)
    expect(a).toMatchObject({ answered: 1, basedOn: '1 of 1 concepts' })
    expect(b).toMatchObject({ answered: 1, basedOn: '1 of 1 concepts' })
  })

  it('reports null, not zero, before the concept has been practised', () => {
    const empty = library.courseMastery({}, 'course-a')
    expect(empty).toEqual({
      value: null,
      confidence: null,
      answered: 0,
      basedOn: '0 of 1 concepts',
    })
  })
})

describe('the real library', () => {
  it('gives every shipped concept a subject and a topic', () => {
    const concepts = allConcepts()
    expect(concepts.length).toBeGreaterThan(0)

    for (const concept of concepts) {
      expect(concept.subject).toBe('operating-systems')
      expect(concept.topicId).toBeTruthy()
      expect(concept.topicTitle).toBeTruthy()
    }
  })

  it('shows the loader’s own getConcept through the library index', () => {
    const first = allConcepts()[0]
    expect(getConcept(first.id)).toMatchObject({ id: first.id, subject: 'operating-systems' })
    expect(registry.getConcept('no-such-concept')).toBeNull()
  })

  it('knows the one subject and its topics', () => {
    expect(subjects()).toContain('operating-systems')
    expect(subjectLabel('operating-systems')).toBe('Operating Systems')
    expect(topicsOfSubject('operating-systems').length).toBeGreaterThan(0)
    expect(coursesContaining(allConcepts()[0].id)).toEqual(['os'])
  })

  it('builds a knowledge node per concept, with the stored estimate attached', () => {
    const userId = 'registry-knowledge-nodes'
    resetMastery(userId)
    const concept = allConcepts()[0]
    recordScore(userId, { conceptId: concept.id, bloom: 'remember', score: 1 })

    const estimates = estimatesFrom(readProgress(userId).concepts)
    const nodes = getKnowledgeNodes(estimates)

    expect(nodes).toHaveLength(allConcepts().length)
    const practised = nodes.find((node) => node.conceptId === concept.id)
    expect(practised).toMatchObject({
      subject: 'operating-systems',
      subjectLabel: 'Operating Systems',
      estimate: 1,
      courseIds: ['os'],
    })
    expect(practised.lastPractised).toBeTruthy()

    const untouched = nodes.find((node) => node.conceptId !== concept.id)
    expect(untouched.estimate).toBeNull()
    expect(untouched.confidence).toBeNull()
    expect(untouched.lastPractised).toBeNull()
  })
})

/**
 * A topic the student typed on the generate page is not taught by any course,
 * but the answers to its questions move mastery all the same: mastery is keyed
 * by (user, concept, bloom) and knows nothing about courses. Registration is
 * what makes the number visible in the library.
 */
describe('a concept the student made by asking for a topic', () => {
  beforeEach(() => resetCustomConcepts())
  afterEach(() => resetCustomConcepts())

  it('is not in the library until it is registered', () => {
    expect(allConcepts().some((concept) => concept.id === 'custom:deadlocks')).toBe(false)
    expect(getConcept('custom:deadlocks')).toBeNull()
  })

  it('joins the library under the title the student typed', () => {
    registerCustomConcept({ id: 'custom:deadlocks', title: 'Deadlocks', subject: 'general' })

    const concept = allConcepts().find((entry) => entry.id === 'custom:deadlocks')
    expect(concept).toMatchObject({ title: 'Deadlocks', subject: 'general', topicId: null })
    expect(getConcept('custom:deadlocks')).toMatchObject({ id: 'custom:deadlocks' })

    // The authored selectors leave it out: there is nothing taught behind it.
    expect(subjects()).not.toContain('general')
    expect(topicsOfSubject('general')).toEqual([])
    expect(coursesContaining('custom:deadlocks')).toEqual([])
  })

  it('shows the mastery its questions earned, flagged as custom', () => {
    const userId = 'registry-custom-concept'
    resetMastery(userId)
    registerCustomConcept({ id: 'custom:deadlocks', title: 'Deadlocks', subject: 'operating-systems' })
    recordScore(userId, { conceptId: 'custom:deadlocks', bloom: 'understand', score: 0.5 })

    const estimates = estimatesFrom(readProgress(userId).concepts)
    const node = getKnowledgeNodes(estimates).find((entry) => entry.id === 'custom:deadlocks')

    expect(node).toMatchObject({
      conceptId: 'custom:deadlocks',
      title: 'Deadlocks',
      subject: 'operating-systems',
      subjectLabel: 'Operating Systems',
      custom: true,
      estimate: 0.5,
    })
    expect(node.lastPractised).toBeTruthy()
  })

  it('is refreshed rather than repeated when the same topic comes back', () => {
    registerCustomConcept({ id: 'custom:deadlocks', title: 'Deadlocks', subject: 'general' })
    registerCustomConcept({ id: 'custom:deadlocks', title: 'Deadlocks and locks', subject: 'os' })

    const matching = allConcepts().filter((concept) => concept.id === 'custom:deadlocks')
    expect(matching).toHaveLength(1)
    expect(matching[0].title).toBe('Deadlocks and locks')
  })
})
