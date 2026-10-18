/**
 * registry — one index over every concept in every course.
 *
 * Mastery belongs to a concept, not to a course: the store is keyed by
 * (userId, conceptId, bloom) and nothing about a course is in that key. A
 * concept can therefore be taught by more than one course without its estimate
 * splitting in two — a topic may list `conceptRefs: [ids]` to reuse a concept
 * another course already defines. This module is where that reuse is resolved,
 * and where the library-wide questions are answered: what subjects exist, what
 * topics a subject covers, what courses a concept appears in.
 *
 * `createRegistry(courses)` is pure and takes the courses as plain objects, so
 * a test can hand it two small courses sharing one concept. The default
 * `registry` is built from the real content through the loader in
 * `./os/index.js`, which is the only course shipping today.
 *
 * The selectors (`conceptMastery`, `topicMastery`, `subjectMastery`,
 * `courseMastery`) all return the same shape and all read stored estimates, so
 * a subject's figure and a course's figure never disagree about the same
 * answers:
 *
 *   { value: number|null, confidence: band|null, answered: number,
 *     basedOn: "N of M concepts" }
 *
 * `getKnowledgeNodes()` is the same library as a flat list, one row per concept
 * with its subject, topic, estimate, confidence, last practised and courses —
 * the shape a graph view can draw without asking the loader anything.
 */

import { getCourse, getTopic } from './os/index.js'
import { rollUp } from '../lib/mastery.js'

/** Slugs that have a hand-written label; anything else is titled from the slug. */
export const SUBJECT_LABELS = {
  'operating-systems': 'Operating Systems',
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function titleFromSlug(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** The label a subject is shown under. Unknown slugs fall back to their words. */
export function subjectLabel(slug) {
  if (!slug) return ''
  return SUBJECT_LABELS[slug] ?? titleFromSlug(slug)
}

/** True when a value can be used as a subject slug. */
export function isSubjectSlug(value) {
  return typeof value === 'string' && SLUG.test(value)
}

/**
 * The shared selector shape: the mean of the concepts that have an estimate,
 * with the confidence behind it and the count it was taken over.
 */
export function masterySummary(estimates = {}, conceptIds = []) {
  const ids = (conceptIds ?? []).filter(Boolean)
  const roll = rollUp(estimates ?? {}, ids)
  const answered = roll?.basedOn ?? 0
  return {
    value: roll ? roll.value : null,
    confidence: roll ? roll.confidence : null,
    answered,
    basedOn: `${answered} of ${ids.length} concepts`,
  }
}

function normaliseTopic(topic, courseId, courseSubject) {
  return {
    id: topic.id,
    title: topic.title ?? titleFromSlug(topic.id),
    courseId,
    subject: topic.subject ?? courseSubject ?? null,
    concepts: Array.isArray(topic.concepts) ? topic.concepts.filter(Boolean) : [],
    conceptRefs: Array.isArray(topic.conceptRefs) ? topic.conceptRefs.filter(Boolean) : [],
  }
}

/**
 * Build a library over a list of courses. A course is
 * `{ id, title, subject?, topics: [{ id, title, subject?, concepts?, conceptRefs? }] }`,
 * where a `concepts` entry is a full concept body and a `conceptRefs` entry names
 * a concept defined somewhere else in the library.
 */
export function createRegistry(courses = []) {
  const conceptById = new Map()
  const topicById = new Map()
  const courseById = new Map()
  const courseConceptIds = new Map()
  const conceptCourseIds = new Map()
  const problems = []

  const addCourseConcept = (courseId, conceptId) => {
    if (!courseConceptIds.has(courseId)) courseConceptIds.set(courseId, [])
    const forCourse = courseConceptIds.get(courseId)
    if (!forCourse.includes(conceptId)) forCourse.push(conceptId)
    if (!conceptCourseIds.has(conceptId)) conceptCourseIds.set(conceptId, [])
    const forConcept = conceptCourseIds.get(conceptId)
    if (!forConcept.includes(courseId)) forConcept.push(courseId)
  }

  // Pass one: every concept a course defines gets a body and a subject. The
  // first definition wins, so a duplicate id inside one library is reported
  // rather than silently overwritten.
  for (const course of courses) {
    courseById.set(course.id, { id: course.id, title: course.title, subject: course.subject ?? null })
    courseConceptIds.set(course.id, [])

    for (const raw of course.topics ?? []) {
      const topic = normaliseTopic(raw, course.id, course.subject)
      topicById.set(topic.id, topic)

      for (const concept of topic.concepts) {
        const subject = concept.subject ?? topic.subject
        if (conceptById.has(concept.id)) {
          problems.push(`duplicate concept id: ${concept.id}`)
        } else {
          conceptById.set(concept.id, {
            id: concept.id,
            title: concept.title ?? titleFromSlug(concept.id),
            subject,
            topicId: topic.id,
            topicTitle: topic.title,
          })
        }
        addCourseConcept(course.id, concept.id)
      }
    }
  }

  // Pass two: refs resolve against the whole library, whatever order the
  // courses were given in.
  for (const course of courses) {
    for (const raw of course.topics ?? []) {
      const topic = topicById.get(raw.id)
      for (const conceptId of topic.conceptRefs) {
        const concept = conceptById.get(conceptId)
        if (!concept) {
          problems.push(`conceptRef not found: ${conceptId} (in ${course.id}/${topic.id})`)
          continue
        }
        addCourseConcept(course.id, conceptId)
      }
    }
  }

  const allConcepts = () => [...conceptById.values()].map((concept) => ({
    ...concept,
    subjectLabel: subjectLabel(concept.subject),
    courseIds: [...(conceptCourseIds.get(concept.id) ?? [])],
  }))

  const conceptsOf = (ids) => (ids ?? []).filter((id) => conceptById.has(id))

  const registry = {
    problems,
    courses: () => [...courseById.values()],
    allConcepts,
    getConcept: (id) => (id && conceptById.has(id) ? allConcepts().find((c) => c.id === id) : null),
    /** Every subject slug the library covers, sorted. */
    subjects: () => [...new Set(allConcepts().map((c) => c.subject).filter(Boolean))].sort(),
    /** The topics a subject covers, in library order. */
    topicsOfSubject: (subject) =>
      [...topicById.values()].filter((topic) => topic.subject === subject),
    /** Every course that teaches (defines or reuses) a concept. */
    coursesContaining: (conceptId) => [...(conceptCourseIds.get(conceptId) ?? [])],
    conceptsOfTopic: (topicId) => conceptsOf(topicById.get(topicId)?.concepts ?? []),
    conceptsOfCourse: (courseId) => conceptsOf(courseConceptIds.get(courseId) ?? []),
    getKnowledgeNodes: (estimates = {}) =>
      allConcepts().map((concept) => {
        const estimate = estimates?.[concept.id] ?? null
        return {
          conceptId: concept.id,
          id: concept.id,
          title: concept.title,
          subject: concept.subject,
          subjectLabel: concept.subjectLabel,
          topicId: concept.topicId,
          topicTitle: concept.topicTitle,
          estimate: estimate && estimate.value != null ? estimate.value : null,
          confidence: estimate?.confidence ?? null,
          lastPractised: estimate?.updatedAt ?? null,
          courseIds: concept.courseIds,
        }
      }),
    conceptMastery: (estimates, conceptId) => masterySummary(estimates, conceptId ? [conceptId] : []),
    topicMastery: (estimates, topicId) => masterySummary(estimates, topicById.get(topicId)?.concepts ?? []),
    subjectMastery: (estimates, subject) =>
      masterySummary(
        estimates,
        allConcepts()
          .filter((concept) => concept.subject === subject)
          .map((concept) => concept.id)
      ),
    courseMastery: (estimates, courseId) => masterySummary(estimates, courseConceptIds.get(courseId) ?? []),
  }

  return registry
}

/** The real course as the registry wants it: `subject` on the course and topics. */
function loadCourses() {
  const course = getCourse('os')
  if (!course) return []
  return [
    {
      id: course.id,
      title: course.title,
      subject: course.topics.find((entry) => entry.subject)?.subject ?? null,
      topics: course.topics.map((entry) => {
        const topic = getTopic(entry.id)
        return {
          id: topic.id,
          title: topic.title,
          subject: topic.subject,
          concepts: topic.concepts,
        }
      }),
    },
  ]
}

export const registry = createRegistry(loadCourses())

export const allConcepts = () => registry.allConcepts()
export const getConcept = (id) => registry.getConcept(id)
export const subjects = () => registry.subjects()
export const topicsOfSubject = (subject) => registry.topicsOfSubject(subject)
export const coursesContaining = (conceptId) => registry.coursesContaining(conceptId)
export const getKnowledgeNodes = (estimates) => registry.getKnowledgeNodes(estimates)
export const conceptMastery = (estimates, conceptId) => registry.conceptMastery(estimates, conceptId)
export const topicMastery = (estimates, topicId) => registry.topicMastery(estimates, topicId)
export const subjectMastery = (estimates, subject) => registry.subjectMastery(estimates, subject)
export const courseMastery = (estimates, courseId) => registry.courseMastery(estimates, courseId)
