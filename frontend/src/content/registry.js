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
 *
 * A topic a student typed on the generate page has no course behind it, but it
 * can still be mastered: mastery is keyed by (user, concept, bloom) and knows
 * nothing about courses, so the slug of what they typed is a perfectly good id.
 * `registerCustomConcept` files one of those in a per-browser list, and
 * `getKnowledgeNodes()` reports it beside the authored concepts with
 * `custom: true`, so nothing mistakes it for taught material. The authored
 * selectors — subjects, topics, courses — leave custom concepts out: they have
 * no course content, and the practice board practises content.
 */

import { getCourse, getTopic } from './os/index.js'
import { COURSE_LOADERS } from './catalog/index.js'
import { rollUp } from '../lib/mastery.js'

/** Slugs that have a hand-written label; anything else is titled from the slug. */
export const SUBJECT_LABELS = {
  'operating-systems': 'Operating Systems',
  'computer-networks': 'Computer Networks',
  'database-management-systems': 'Database Management Systems',
  'system-design': 'System Design',
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
  const loaders = [{ getCourse, getTopic }, ...Object.values(COURSE_LOADERS)]
  return loaders.flatMap((loader) => {
    const course = loader.getCourse()
    if (!course) return []
    return [{
      id: course.id,
      title: course.title,
      subject: course.topics.find((entry) => entry.subject)?.subject ?? null,
      topics: course.topics.map((entry) => {
        const topic = loader.getTopic(entry.id)
        return {
          id: topic.id,
          title: topic.title,
          subject: topic.subject,
          concepts: topic.concepts,
        }
      }),
    }]
  })
}

export const registry = createRegistry(loadCourses())

// ── Concepts the student made by asking for a topic ─────────

const CUSTOM_STORAGE_KEY = 'qm_custom_concepts'

const canStoreCustom = typeof window !== 'undefined' && Boolean(window.localStorage)

let customCache = null

function readCustom() {
  if (!canStoreCustom) return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id) : []
  } catch {
    return []
  }
}

function writeCustom(list) {
  if (!canStoreCustom) return
  try {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage full or blocked: the in-memory list is still right this session.
  }
}

/** Every custom concept this browser has registered, oldest first. */
export function customConcepts() {
  if (customCache === null) customCache = readCustom()
  return customCache
}

/**
 * Register (or refresh) the concept behind a topic the student typed. The id
 * is the caller's to build - `custom:<slug>` - so it is stable across runs and
 * the mastery already earned stays attached. Returns the stored entry, or null
 * when there is nothing worth registering.
 */
export function registerCustomConcept({ id, title, subject } = {}) {
  const name = String(title ?? '').trim()
  if (!id || !name) return null
  const entry = { id, title: name, subject: subject || null }
  const next = [...customConcepts().filter((concept) => concept.id !== id), entry]
  customCache = next
  writeCustom(next)
  return entry
}

/** Forget every custom concept. For tests, and for a full profile reset. */
export function resetCustomConcepts() {
  customCache = []
  writeCustom([])
}

/** A custom concept in the same shape `allConcepts()` reports. */
function customConceptEntry(concept) {
  return {
    id: concept.id,
    title: concept.title,
    subject: concept.subject,
    subjectLabel: subjectLabel(concept.subject),
    topicId: null,
    topicTitle: concept.title,
    courseIds: [],
  }
}

export const allConcepts = () => [
  ...registry.allConcepts(),
  ...customConcepts().map(customConceptEntry),
]

export const getConcept = (id) => {
  const authored = registry.getConcept(id)
  if (authored) return authored
  const custom = customConcepts().find((concept) => concept.id === id)
  return custom ? customConceptEntry(custom) : null
}

export const subjects = () => registry.subjects()
export const topicsOfSubject = (subject) => registry.topicsOfSubject(subject)
export const coursesContaining = (conceptId) => registry.coursesContaining(conceptId)

/** The authored library, then the concepts the student made, marked as such. */
export const getKnowledgeNodes = (estimates) => [
  ...registry.getKnowledgeNodes(estimates),
  ...customConcepts().map((concept) => {
    const estimate = estimates?.[concept.id] ?? null
    return {
      ...customConceptEntry(concept),
      conceptId: concept.id,
      estimate: estimate && estimate.value != null ? estimate.value : null,
      confidence: estimate?.confidence ?? null,
      lastPractised: estimate?.updatedAt ?? null,
      custom: true,
    }
  }),
]

export const conceptMastery = (estimates, conceptId) => registry.conceptMastery(estimates, conceptId)
export const topicMastery = (estimates, topicId) => registry.topicMastery(estimates, topicId)
export const subjectMastery = (estimates, subject) => registry.subjectMastery(estimates, subject)
export const courseMastery = (estimates, courseId) => registry.courseMastery(estimates, courseId)
