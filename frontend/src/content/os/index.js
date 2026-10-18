/**
 * Content loader — the single entry point for Operating Systems course content.
 *
 * Every `.json` file under `src/content/os` is imported eagerly at build time, so
 * dropping a new lesson file into a topic folder is the only step needed to add
 * content. The on-disk shapes:
 *
 *   <topic>.json          flat topic: { id, title, concepts: ["concept-x", ...] }
 *   <topic>/topic.json    full topic: { concepts: { "concept-x": { id, title,
 *                                              prerequisiteIds,
 *                                              prerequisiteLabels: { id: label },
 *                                              lessonIds, resources, questions } } }
 *   <topic>/topic.json    folder topic: { id, title, summary,
 *                                              conceptIds: ["concept-x", ...] }
 *   <topic>/concepts/<id>.json  concept: { id, title, prerequisiteIds,
 *                                              lessonIds, resources, questions }
 *   <topic>/<lesson>.json lesson:     { id, title, estMinutes, source,
 *                                              objectives, blocks }
 *
 * A folder topic may name its concepts and leave each body to its own file,
 * which is how `scripts/import-content.mjs` writes a long topic: topic.json
 * holds the metadata and the reading order, and one file holds one concept.
 * A concept file's body wins over an inline seed with the same id.
 *
 * Every topic shape is normalised into one graph, and the loose lesson
 * references in topic.json (file stems, "lesson-*" ids) are resolved to
 * canonical lesson ids. A lesson's check question may be a block or a
 * top-level `check` object; both are normalised to the block form.
 *
 * A concept comes back with what can be practised on it — the authored
 * `questions` plus the checks its lessons already ask (see checkQuestion) — and
 * with the study material a human chose for it, which is always allowed to be
 * empty.
 *
 * prerequisiteLabels names the *link* ("requires", "loads on fault"), not the
 * concept, so the topic graph can label its edges; a link without a label is
 * still drawn, just bare.
 */

const modules = import.meta.glob('./**/*.json', { eager: true })

const COURSE = {
  id: 'os',
  title: 'Operating Systems',
  summary:
    'How a computer runs your programs: processes and threads, CPU scheduling, synchronisation, deadlocks, memory management and file systems.',
  level: 'intermediate',
  topicIds: [
    'os-fundamentals',
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
const RE_CONCEPT = /^\.\/([^/]+)\/concepts\/([^/]+)\.json$/
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
const conceptSources = []

for (const [path, mod] of Object.entries(modules)) {
  const data = mod?.default ?? mod
  const folderTopic = path.match(RE_FOLDER_TOPIC)
  const flatTopic = path.match(RE_FLAT_TOPIC)
  const concept = path.match(RE_CONCEPT)
  const lesson = path.match(RE_LESSON)

  if (folderTopic) topicSources.push({ topicId: folderTopic[1], data })
  else if (flatTopic) topicSources.push({ topicId: flatTopic[1], data })
  else if (concept) conceptSources.push({ topicId: concept[1], stem: concept[2], data })
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
 * A lesson's check block, as a question the practice session can ask. It keeps
 * the lesson id and the block index, so answering it can be recorded in the same
 * place the reader records it and the concept's mastery stays one number.
 *
 * The envelope a lesson check does not carry (type, bloom, difficulty) uses the
 * same defaults the content validator applies.
 */
function checkQuestion(lesson, block, blockIndex) {
  return {
    id: `check-${lesson.id}-${blockIndex}`,
    type: 'mcq',
    bloom: block.bloom ?? 'understand',
    difficulty: block.difficulty ?? 'medium',
    prompt: block.prompt ?? block.question ?? '',
    options: Array.isArray(block.options) ? block.options : [],
    correctIndex: block.correctIndex,
    explanation: block.explanation ?? '',
    needsHumanCheck: true,
    lessonId: lesson.id,
    blockIndex,
    source: 'lesson',
  }
}

/** The questions a lesson's check blocks contribute to a concept's bank. */
function lessonQuestions(lessonIds) {
  const questions = []
  for (const lessonId of lessonIds) {
    const lesson = lessonsById.get(lessonId)
    if (!lesson) continue
    lesson.blocks.forEach((block, blockIndex) => {
      if (block?.kind === 'check') questions.push(checkQuestion(lesson, block, blockIndex))
    })
  }
  return questions
}

/**
 * A concept with its graph resolved: prerequisites as objects (each carrying
 * the label of the link that points at this concept), lessons as summaries, and
 * the questions it can be practised on (authored `questions`, plus the checks
 * its lessons already ask).
 *
 * Both the topic and the concept endpoints return this shape, so a consumer
 * never has to resolve ids itself.
 */
function conceptWithGraph(concept) {
  const fromLessons = lessonQuestions(concept.lessonIds)
  return {
    ...concept,
    prerequisites: concept.prerequisiteIds
      .map((id) => conceptsById.get(id))
      .filter(Boolean)
      .map(({ id, title, topicId }) => ({
        id,
        title,
        topicId,
        label: concept.prerequisiteLabels?.[id] ?? null,
      })),
    lessons: concept.lessonIds.map((id) => lessonSummary(lessonsById.get(id))),
    lessonQuestions: fromLessons,
    resourceCount: concept.resources.length,
    questionCount: concept.questions.length + fromLessons.length,
  }
}

// ── Normalise the graph ─────────────────────────────────────

for (const { topicId, data } of topicSources) {
  // A topic declares its subject once; a concept without its own `subject`
  // inherits it, so a topic that lists bare ids still belongs somewhere.
  const topicSubject = data.subject || null
  // A topic declares its concepts in one of three ways: `conceptIds` (the bodies
  // are in their own files), a list of ids (same, without the file bodies), or a
  // map of id -> seed. Any order they give is the order the topic keeps.
  const declared = Array.isArray(data.conceptIds) ? data.conceptIds.map((id) => [id, {}]) : null
  const inline = Array.isArray(data.concepts)
    ? data.concepts.map((id) => [id, {}])
    : Object.entries(data.concepts ?? {})

  const ordered = []
  const seedsById = new Map()
  const remember = (id, seed) => {
    if (!seedsById.has(id)) ordered.push(id)
    seedsById.set(id, { ...(seedsById.get(id) ?? {}), ...seed })
  }

  for (const [id, seed] of declared ?? inline) remember(id, seed)
  if (declared) for (const [id, seed] of inline) remember(id, seed)

  for (const concept of conceptSources) {
    if (concept.topicId !== topicId) continue
    remember(concept.data.id || concept.stem, concept.data)
  }

  const entries = ordered.map((id) => [id, seedsById.get(id) ?? {}])

  const conceptIds = []
  const lessonIds = []
  let resourceCount = 0
  let questionCount = 0

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

    const resources = Array.isArray(seed.resources) ? seed.resources : []
    const questions = Array.isArray(seed.questions) ? seed.questions : []

    const concept = {
      id,
      title: seed.title || titleFromSlug(id),
      subject: seed.subject || topicSubject,
      summary: seed.summary || '',
      prerequisiteIds: seed.prerequisiteIds ?? [],
      prerequisiteLabels: seed.prerequisiteLabels ?? {},
      lessonIds: [...new Set(resolved)],
      resources,
      questions,
      topicId,
    }

    resourceCount += resources.length
    questionCount += questions.length + lessonQuestions(concept.lessonIds).length

    conceptsById.set(id, concept)
    conceptIds.push(id)
    lessonIds.push(...concept.lessonIds)
  }

  topicsById.set(topicId, {
    id: topicId,
    title: data.title || TOPIC_TITLES[topicId] || titleFromSlug(topicId),
    subject: topicSubject,
    summary: data.summary || '',
    conceptIds,
    lessonIds: [...new Set(lessonIds)],
    resourceCount,
    questionCount,
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
      subject: topic.subject,
      conceptCount: topic.conceptIds.length,
      // The ids, so a topic's mastery roll-up can cover its concepts without
      // loading every concept on an overview screen.
      conceptIds: topic.conceptIds,
      lessonCount: topic.lessonIds.length,
      lessonIds: topic.lessonIds,
      resourceCount: topic.resourceCount,
      questionCount: topic.questionCount,
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
