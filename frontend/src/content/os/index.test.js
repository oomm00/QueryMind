/**
 * The content loader — the shape the app is allowed to assume about the course,
 * checked against whatever the content holds rather than a frozen count.
 *
 * At least one lesson check exists in the content today; if that ever stops
 * being true, the validator and the practice tests are the ones to change, not
 * this file's consistency rules.
 */

import { describe, expect, it } from 'vitest'
import {
  COURSE,
  getConcept,
  getCourse,
  getLesson,
  getTopic,
  isPlaceholderLesson,
  listTopics,
  resolveLessonId,
} from './index.js'

describe('getCourse', () => {
  it('reports every topic with the ids a roll-up needs and honest counts', () => {
    const course = getCourse('os')

    expect(course.id).toBe('os')
    expect(course.topics).toHaveLength(COURSE.topicIds.length)

    for (const topic of course.topics) {
      expect(topic.title).toBeTruthy()
      expect(topic.conceptIds).toHaveLength(topic.conceptCount)
      expect(topic.lessonIds).toHaveLength(topic.lessonCount)
      expect(topic.questionCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('answers to the catalog alias and to nothing else', () => {
    expect(getCourse('operating-systems')?.id).toBe('os')
    expect(getCourse('astrophysics')).toBeNull()
  })
})

describe('listTopics', () => {
  it('gives the same topics as the course, each with concepts', () => {
    const topics = listTopics()
    expect(topics.map((topic) => topic.id)).toEqual(COURSE.topicIds)
    for (const topic of topics) {
      expect(topic.conceptIds.length).toBeGreaterThan(0)
    }
  })
})

describe('getTopic', () => {
  const topic = getTopic('memory-management')

  it('gives its concepts in the topic own order, with the graph resolved', () => {
    expect(topic.concepts.map((concept) => concept.id)).toEqual(topic.conceptIds)

    for (const concept of topic.concepts) {
      expect(concept.title).toBeTruthy()
      expect(concept.topicId).toBe('memory-management')
      expect(concept.resourceCount).toBe(concept.resources.length)
      expect(concept.questionCount).toBe(
        concept.questions.length + concept.lessonQuestions.length
      )
      // A prerequisite is resolved to an object with a title, never a bare id.
      for (const prerequisite of concept.prerequisites) {
        expect(prerequisite.id).toBeTruthy()
        expect(prerequisite.title).toBeTruthy()
      }
      for (const lesson of concept.lessons) {
        expect(lesson.title).toBeTruthy()
        expect(typeof lesson.isPlaceholder).toBe('boolean')
      }
    }
  })

  it('matches the counts the course summary promised', () => {
    const summary = getCourse('os').topics.find((entry) => entry.id === 'memory-management')
    expect(summary.conceptCount).toBe(topic.concepts.length)
    expect(summary.resourceCount).toBe(topic.resourceCount)
    expect(summary.questionCount).toBe(topic.questionCount)
    expect(summary.lessonIds).toEqual(topic.lessonIds)
  })

  it('is null for a topic that does not exist', () => {
    expect(getTopic('no-such-topic')).toBeNull()
  })
})

describe('a topic whose concepts live in their own files', () => {
  const topic = getTopic('os-fundamentals')

  it('opens the course, with every prerequisite inside the topic', () => {
    expect(COURSE.topicIds[0]).toBe('os-fundamentals')
    expect(getCourse('os').topics[0].id).toBe('os-fundamentals')

    expect(topic.concepts).toHaveLength(4)
    expect(topic.concepts[0].prerequisites).toEqual([])
    for (const concept of topic.concepts) {
      // Nothing points at an earlier topic: whatever this topic needs, it
      // teaches, so it can be the first one in the course.
      for (const prerequisite of concept.prerequisites) {
        expect(prerequisite.topicId).toBe('os-fundamentals')
      }
      expect(concept.lessonIds).toEqual([])
    }
  })

  it('reads each concept body from its own file, in the order topic.json lists', () => {
    expect(topic.title).toBe(
      'Operating system fundamentals: kernel, privilege modes, and system calls'
    )
    expect(topic.concepts.map((concept) => concept.title)).toEqual([
      'Kernel responsibilities',
      'User mode and kernel mode',
      'The system-call interface',
      'System-call lifecycle and error handling',
    ])
    expect(topic.concepts[0].resources[0].url).toBe(
      'https://en.wikipedia.org/wiki/Kernel_%28operating_system%29'
    )
  })

  it('counts the material it brought with it, on the topic and in the course', () => {
    const summary = getCourse('os').topics.find((entry) => entry.id === 'os-fundamentals')

    expect(summary.conceptCount).toBe(4)
    expect(summary.resourceCount).toBe(7)
    expect(summary.questionCount).toBe(24)
    expect(topic.resourceCount).toBe(7)
    expect(topic.questionCount).toBe(24)
  })

  it('keeps every multiple-choice answer inside its options', () => {
    for (const concept of topic.concepts) {
      for (const question of concept.questions) {
        if (question.type !== 'mcq') continue
        expect(question.options).toHaveLength(4)
        expect(question.correctIndex).toBeGreaterThanOrEqual(0)
        expect(question.correctIndex).toBeLessThan(question.options.length)
      }
    }
  })

  it('does not put more than 8 of its 20 multiple-choice answers on one index', () => {
    const answers = topic.concepts.flatMap((concept) =>
      concept.questions
        .filter((question) => question.type === 'mcq')
        .map((question) => question.correctIndex)
    )

    expect(answers).toHaveLength(20)
    const counts = [0, 0, 0, 0]
    for (const index of answers) counts[index] += 1
    for (const count of counts) expect(count).toBeLessThanOrEqual(8)
  })
})

describe('getConcept', () => {
  it('returns one concept with the same shape as the topic list', () => {
    const concept = getConcept('paging')
    expect(concept.id).toBe('paging')
    expect(concept.questionCount).toBe(concept.questions.length + concept.lessonQuestions.length)
    expect(getConcept('no-such-concept')).toBeNull()
  })
})

describe('lesson checks', () => {
  it('become one question per check, pointing back at the block they came from', () => {
    const topic = getTopic('memory-management')
    let total = 0

    for (const concept of topic.concepts) {
      for (const summary of concept.lessons) {
        const lesson = getLesson(summary.id)
        const questions = concept.lessonQuestions.filter(
          (question) => question.lessonId === lesson.id
        )
        let checks = 0

        lesson.blocks.forEach((block, blockIndex) => {
          if (block?.kind !== 'check') return
          checks += 1

          const question = questions.find((item) => item.blockIndex === blockIndex)
          expect(question).toBeDefined()
          expect(question.id).toBe(`check-${lesson.id}-${blockIndex}`)
          expect(question.type).toBe('mcq')
          expect(question.bloom).toBe(block.bloom ?? 'understand')
          expect(question.prompt).toBe(block.prompt ?? block.question ?? '')
          expect(question.options).toEqual(block.options)
          expect(question.correctIndex).toBe(block.correctIndex)
          expect(question.correctIndex).toBeGreaterThanOrEqual(0)
          expect(question.correctIndex).toBeLessThan(question.options.length)
        })

        expect(questions).toHaveLength(checks)
        total += checks
      }
    }

    expect(total).toBeGreaterThan(0)
  })

  it('resolves a lesson id to itself and an unknown reference to null', () => {
    const lessonId = getTopic('memory-management').concepts[0].lessons[0].id
    expect(resolveLessonId(lessonId)).toBe(lessonId)
    expect(resolveLessonId('no-such-lesson')).toBeNull()
    expect(resolveLessonId(null)).toBeNull()
  })

  it('calls a lesson with no body a placeholder', () => {
    expect(isPlaceholderLesson({ title: 'Coming soon', blocks: [] })).toBe(true)
    expect(isPlaceholderLesson({ title: 'A written lesson', blocks: [{ kind: 'text' }] })).toBe(
      false
    )
    expect(isPlaceholderLesson(null)).toBe(false)
  })
})
