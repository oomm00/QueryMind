/**
 * Content loader — the single entry point for Operating Systems course content.
 *
 * Every `.json` file under `src/content/os` is imported eagerly at build time, so
 * dropping a new lesson file into a topic folder is the only step needed to add
 * content. Two on-disk shapes are supported:
 *
 *   <topic>.json          flat topic: { id, title, concepts: ["concept-x", ...] }
 *   <topic>/topic.json    full topic: { concepts: { "concept-x": { id, title,
 *                                              prerequisiteIds, lessonIds } } }
 *   <topic>/<lesson>.json lesson:     { id, title, estMinutes, source,
 *                                              objectives, blocks }
 *
 * Both topic shapes are normalised into one graph, and the loose lesson
 * references in topic.json (file stems, "lesson-*" ids) are resolved to
 * canonical lesson ids. A lesson's check question may be a block or a
 * top-level `check` object; both are normalised to the block form.
 */

const modules = import.meta.glob('./**/*.json', { eager: true })

const COURSE = {
  id: 'os',
  title: 'Operating Systems',
  summary:
    'How a computer runs your programs: processes and threads, CPU scheduling, synchronisation, deadlocks, memory management and file systems.',
  level: 'intermediate',
  topicIds: [
    'processes-threads',
    'cpu-scheduling',
    'synchronization',
    'deadlocks',
    'memory-management',
    'virtual-memory-lab',
    'file-systems',
  ],
}

// Folder topics carry no title of their own; name any that differ from the slug.
const TOPIC_TITLES = { 'memory-management': 'Memory Management' }

// The Explore catalog identifies courses by its own slugs; map them onto the
// content course so /learn/operating-systems/... resolves as well as /learn/os/...
const COURSE_ALIASES = { 'operating-systems': 'os' }

function resolveCourseId(courseId) {
  if (!courseId) return COURSE.id
  return COURSE_ALIASES[courseId] ?? courseId
}

const RE_FLAT_TOPIC = /^\.\/([^/]+)\.json$/
const RE_FOLDER_TOPIC = /^\.\/([^/]+)\/topic\.json$/
const RE_LESSON = /^\.\/([^/]+)\/([^/]+)\.json$/

function titleFromSlug(slug) {
  return String(slug ?? '')
    .replace(/^concept-/, '')
    .replace(/^lesson-/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ── Index the files ─────────────────────────────────────────

const lessonsById = new Map()
const lessonAliases = new Map() // any reference -> canonical lesson id
const topicsById = new Map()
const conceptsById = new Map()

const topicSources = []
const lessonSources = []

for (const [path, mod] of Object.entries(modules)) {
  const data = mod?.default ?? mod
  const folderTopic = path.match(RE_FOLDER_TOPIC)
  const flatTopic = path.match(RE_FLAT_TOPIC)
  const lesson = path.match(RE_LESSON)

  if (folderTopic) topicSources.push({ topicId: folderTopic[1], data })
  else if (flatTopic) topicSources.push({ topicId: flatTopic[1], data })
  else if (lesson) lessonSources.push({ topicId: lesson[1], stem: lesson[2], data })
}

/**
 * Lessons come in two shapes. Current lessons carry their check question as a
 * block; older stubs carry it as a top-level `check` object. Both are supported
 * and normalised to the block form, so consumers only ever see `blocks`.
 */
function normalizeBlocks(data) {
  const blocks = Array.isArray(data.blocks) ? [...data.blocks] : []
  const legacy = data.check
  if (legacy && typeof legacy === 'object') {
    for (const check of Array.isArray(legacy) ? legacy : [legacy]) {
      blocks.push({ kind: 'check', ...check })
    }
  }
  return blocks
}

for (const { topicId, stem, data } of lessonSources) {
  const id = data.id || `lesson-${stem}`
  lessonsById.set(id, { ...data, id, topicId, blocks: normalizeBlocks(data) })
  lessonAliases.set(id, id)
  lessonAliases.set(stem, id)
  lessonAliases.set(`lesson-${stem}`, id)
}

/** Accept a lesson id, a file stem, or "lesson-<stem>". */
export function resolveLessonId(reference) {
  if (reference == null) return null
  return lessonAliases.get(reference) ?? null
}

export const PLACEHOLDER_TITLE = 'Coming soon'

/**
 * A lesson the outline knows about but whose body has not been written yet:
 * it is literally titled "Coming soon", or it has no blocks at all. The reader
 * renders a "not written yet" state for these instead of an error.
 */
export function isPlaceholderLesson(lesson) {
  if (!lesson) return false
  const title = String(lesson.title ?? '').trim().toLowerCase()
  return title === PLACEHOLDER_TITLE.toLowerCase() || (lesson.blocks?.length ?? 0) === 0
}

/** Light lesson record for navigational surfaces, so they need not load blocks. */
function lessonSummary(lesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    estMinutes: lesson.estMinutes ?? null,
    topicId: lesson.topicId,
    isPlaceholder: isPlaceholderLesson(lesson),
  }
}

/**
 * A concept with its graph resolved: prerequisites as objects, lessons as
 * summaries. Both the topic and the concept endpoints return this shape, so a
 * consumer never has to resolve ids itself.
 */
function conceptWithGraph(concept) {
  return {
    ...concept,
    prerequisites: concept.prerequisiteIds
      .map((id) => conceptsById.get(id))
      .filter(Boolean)
      .map(({ id, title, topicId }) => ({ id, title, topicId })),
    lessons: concept.lessonIds.map((id) => lessonSummary(lessonsById.get(id))),
  }
}

// ── Normalise the graph ─────────────────────────────────────

for (const { topicId, data } of topicSources) {
  const entries = Array.isArray(data.concepts)
    ? data.concepts.map((id) => [id, {}])
    : Object.entries(data.concepts ?? {})

  const conceptIds = []
  const lessonIds = []

  for (const [id, seed] of entries) {
    const references = seed.lessonIds ?? []
    const resolved = references
      .map(resolveLessonId)
      .filter((lessonId) => lessonId && lessonsById.has(lessonId))

    if (import.meta.env.DEV) {
      const unresolved = references.filter((reference) => !resolveLessonId(reference))
      if (unresolved.length > 0) {
        console.warn(
          `[content] ${topicId}/${id}: unresolved lesson reference(s): ${unresolved.join(', ')}`
        )
      }
    }

    const concept = {
      id,
      title: seed.title || titleFromSlug(id),
      summary: seed.summary || '',
      prerequisiteIds: seed.prerequisiteIds ?? [],
      lessonIds: [...new Set(resolved)],
      topicId,
    }

    conceptsById.set(id, concept)
    conceptIds.push(id)
    lessonIds.push(...concept.lessonIds)
  }

  topicsById.set(topicId, {
    id: topicId,
    title: data.title || TOPIC_TITLES[topicId] || titleFromSlug(topicId),
    summary: data.summary || '',
    conceptIds,
    lessonIds: [...new Set(lessonIds)],
  })
}

// ── Public read API ─────────────────────────────────────────

export function getCourse(courseId = COURSE.id) {
  if (resolveCourseId(courseId) !== COURSE.id) return null
  const topics = COURSE.topicIds
    .map((id) => topicsById.get(id))
    .filter(Boolean)
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      conceptCount: topic.conceptIds.length,
      lessonCount: topic.lessonIds.length,
      lessonIds: topic.lessonIds,
    }))
  return { ...COURSE, topics }
}

export function getTopic(topicId) {
  const topic = topicsById.get(topicId)
  if (!topic) return null
  const concepts = topic.conceptIds
    .map((id) => conceptsById.get(id))
    .filter(Boolean)
    .map(conceptWithGraph)
  return { ...topic, concepts }
}

export function getConcept(conceptId) {
  const concept = conceptsById.get(conceptId)
  if (!concept) return null
  return conceptWithGraph(concept)
}

export function getLesson(lessonId) {
  const id = resolveLessonId(lessonId)
  return id ? lessonsById.get(id) ?? null : null
}

export function listTopics() {
  return COURSE.topicIds.map((id) => topicsById.get(id)).filter(Boolean)
}

export { COURSE }
