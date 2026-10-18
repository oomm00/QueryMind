#!/usr/bin/env node
/**
 * import-content — bring a topic file authored elsewhere into the content set.
 *
 *   node scripts/import-content.mjs <file.json> <course-id> [options]
 *
 *     --topic <id>   the topic id, when the file (and its name) do not say
 *     --root <dir>   content root to import into (default src/content)
 *     --dry-run      validate and report, write nothing
 *     --force        overwrite the destination if it is already there
 *     --no-shuffle   keep the options in the order they were authored
 *
 * The file is checked with exactly the rules `npm run validate:content` applies,
 * and against the concepts already in the content set, so prerequisites that
 * point at another topic resolve instead of looking missing. Nothing is written
 * until it passes.
 *
 * What it accepts, and where it lands:
 *
 *   { topic: { id, title, summary }, concepts: [ { id, title, ... } ] }
 *       -> <root>/<course-id>/<topic-id>/topic.json
 *       -> <root>/<course-id>/<topic-id>/concepts/<concept-id>.json
 *   { id, title, concepts: { "concept-id": { ... } } }
 *       -> <root>/<course-id>/<topic-id>/topic.json
 *   { id, title, concepts: ["concept-id", ...] }
 *       -> <root>/<course-id>/<topic-id>.json     (a stub: the concepts live
 *                                                  in the topic's other files)
 *
 * Two things are rewritten, and nothing else is:
 *
 *   options   Each mcq's options are shuffled by a random number generator
 *             seeded with the question id. The seed makes the result stable, so
 *             importing the same file twice writes the same bytes, and the
 *             answer is carried to wherever its option landed. Where the answers
 *             sit is then balanced across the topic, so one index cannot collect
 *             them all: a file whose answers were all at index 0 reads as
 *             machine-written, and this fixes that without touching a word of
 *             what was authored.
 *   urls      A resource URL loses a leading "www." and an ignored trailing
 *             slash, so the same page authored twice counts once.
 *
 * Lessons are not touched. A topic file may name lesson ids that do not exist
 * yet; the lesson files are authored separately.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONTENT_ROOT,
  bannedPhraseProblems,
  normalizeResourceUrl,
  readDocuments,
  topicWarnings,
  validateDocuments,
} from './validate-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')
const LOADER_FILE = join(PROJECT_ROOT, 'src', 'content', 'os', 'index.js')

export const TOPIC_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CONCEPTS_DIR = 'concepts'

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isFilled = (value) => typeof value === 'string' && value.trim().length > 0

export function slugFromFile(file) {
  return basename(file).replace(/\.json$/i, '').toLowerCase()
}

/** The topic's own fields, whether they sit under `topic` or at the top level. */
function topicMeta(data) {
  const topic = isObject(data?.topic) ? data.topic : {}
  return {
    id: topic.id || data?.id || data?.topicId || '',
    title: topic.title || data?.title || '',
    summary: topic.summary || data?.summary || '',
  }
}

/** Which of the three shapes a file arrived in. */
export function topicShape(data) {
  if (!isObject(data)) return 'none'
  if ('blocks' in data || 'check' in data) return 'lesson'
  const { concepts } = data
  if (isObject(concepts)) return 'map'
  if (Array.isArray(concepts)) {
    if (concepts.length === 0) return 'stub'
    return concepts.every((entry) => typeof entry === 'string') ? 'stub' : 'concepts'
  }
  return 'none'
}

/** The concepts of a `concepts: [...]` file, keeping their order. */
function conceptEntries(data) {
  return (Array.isArray(data?.concepts) ? data.concepts : [])
    .map((concept, index) => ({ concept, index }))
    .filter(({ concept }) => isObject(concept))
    .map(({ concept, index }) => ({ concept, index, id: isFilled(concept.id) ? concept.id : '' }))
}

// ── The shuffle ─────────────────────────────────────────────

/** FNV-1a: a stable 32-bit seed from a question id, the same on every machine. */
export function seedFromId(id) {
  let hash = 2166136261
  const text = String(id ?? '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32 — small, seeded, and repeatable. */
export function seededRandom(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One mcq with its options shuffled. The order comes from a generator seeded
 * with the question id, so the same question always reads the same way, and the
 * answer is carried to wherever its option landed.
 *
 * When a topic-wide `counts` is passed, the answer is then moved to the
 * least-used slot: a per-question shuffle alone can leave half a topic's answers
 * on one index. Both steps are deterministic, so importing the same file twice
 * writes the same bytes.
 */
export function shuffleQuestion(question, counts = null) {
  if (!isObject(question) || question.type !== 'mcq') return question

  const options = question.options
  if (!Array.isArray(options) || options.length < 2) return question

  const index = Number(question.correctIndex)
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return question

  const answer = options[index]
  const random = seededRandom(seedFromId(question.id))
  const shuffled = [...options]
  for (let cursor = shuffled.length - 1; cursor > 0; cursor -= 1) {
    const swap = Math.floor(random() * (cursor + 1))
    const holding = shuffled[cursor]
    shuffled[cursor] = shuffled[swap]
    shuffled[swap] = holding
  }

  if (!counts) {
    return { ...question, options: shuffled, correctIndex: shuffled.indexOf(answer) }
  }

  const loads = shuffled.map((_, slot) => counts[slot] ?? 0)
  const lightest = Math.min(...loads)
  const room = loads
    .map((load, slot) => (load === lightest ? slot : -1))
    .filter((slot) => slot >= 0)
  const target = room[Math.floor(random() * room.length)]
  const at = shuffled.indexOf(answer)
  const holding = shuffled[target]
  shuffled[target] = answer
  shuffled[at] = holding
  counts[target] = (counts[target] ?? 0) + 1

  return { ...question, options: shuffled, correctIndex: target }
}

/** One concept with its resource URLs normalised. */
export function normaliseConcept(concept) {
  const resources = Array.isArray(concept.resources)
    ? concept.resources.map((resource) =>
        isObject(resource) ? { ...resource, url: normalizeResourceUrl(resource.url) } : resource
      )
    : concept.resources

  return { ...concept, resources }
}

/**
 * Shuffle every mcq in a topic at once, so the answers are spread over the
 * option slots rather than each question being shuffled in isolation.
 */
export function shuffleTopicOptions(concepts = []) {
  const counts = []
  return concepts.map((concept) => {
    if (!isObject(concept) || !Array.isArray(concept.questions)) return concept
    return {
      ...concept,
      questions: concept.questions.map((question) => shuffleQuestion(question, counts)),
    }
  })
}

/**
 * The files to write, as paths relative to the content root, plus the prepared
 * concepts so a caller can report what the shuffle did. `shuffle: false` builds
 * the same files with the options left as authored.
 */
export function topicToFiles(data, { courseId = '', topicId = '', shuffle = true } = {}) {
  const shape = topicShape(data)
  const base = `${courseId ? `${courseId}/` : ''}${topicId}`

  if (shape === 'stub') {
    return { shape, documents: [{ path: `${base}.json`, data: { ...data } }], concepts: [] }
  }

  const keys =
    shape === 'map'
      ? Object.keys(data.concepts)
      : conceptEntries(data).map((entry) => entry.id)
  const seeds =
    shape === 'map'
      ? Object.values(data.concepts)
      : conceptEntries(data).map((entry) => entry.concept)

  const normalised = seeds.map((seed) => (isObject(seed) ? normaliseConcept(seed) : seed))
  const concepts = shuffle ? shuffleTopicOptions(normalised) : normalised

  if (shape === 'map') {
    const asMap = {}
    keys.forEach((key, at) => {
      asMap[key] = concepts[at]
    })
    return {
      shape,
      documents: [{ path: `${base}/topic.json`, data: { ...data, concepts: asMap } }],
      concepts,
    }
  }

  const topic = topicMeta(data)

  return {
    shape,
    documents: [
      {
        path: `${base}/topic.json`,
        data: {
          id: topicId || topic.id,
          title: topic.title,
          summary: topic.summary,
          conceptIds: keys,
        },
      },
      ...keys.map((key, at) => ({
        path: `${base}/${CONCEPTS_DIR}/${key}.json`,
        data: concepts[at],
      })),
    ],
    concepts,
  }
}

/** Where the correct answers sit now, as raw indexes in question order. */
export function mcqAnswers(concepts = []) {
  const indexes = []
  for (const concept of concepts) {
    for (const question of Array.isArray(concept?.questions) ? concept.questions : []) {
      if (!isObject(question) || question.type !== 'mcq') continue
      const index = Number(question.correctIndex)
      if (Number.isInteger(index) && index >= 0) indexes.push(index)
    }
  }
  return indexes
}

/** How many answers sit at each option index, from 0 up to the highest one. */
export function indexDistribution(indexes = []) {
  const counts = []
  for (const index of indexes) counts[index] = (counts[index] ?? 0) + 1
  return Array.from({ length: counts.length }, (_, index) => counts[index] ?? 0)
}

// ── Planning the import ─────────────────────────────────────

/**
 * Structure the destination files, or explain why the file cannot be imported.
 * Returns { problems, courseId, topicId, shape, isFolder, target, targets }.
 */
export function planImport({ data, file, courseId, topicId, rootDir = CONTENT_ROOT }) {
  const problems = []
  const meta = topicMeta(data)
  const id = topicId || meta.id || slugFromFile(file)
  const course = courseId || ''
  const shape = topicShape(data)

  if (!course) problems.push('a course id is required, e.g. `import-content.mjs topic.json os`')
  if (!id || !TOPIC_ID.test(id)) {
    problems.push(
      `topic id "${id || ''}" must be lower-case words separated by dashes (pass --topic <id> to set it)`
    )
  }

  if (shape === 'lesson') {
    problems.push(
      `${basename(file)} is a lesson — only topic files are imported; lessons are authored where the topic points`
    )
  } else if (shape === 'none') {
    problems.push(`${basename(file)} has no "concepts", so there is nothing to import`)
  }

  if (shape === 'concepts') {
    const seen = new Set()
    for (const entry of conceptEntries(data)) {
      if (!entry.id || !TOPIC_ID.test(entry.id)) {
        problems.push(
          `concept ${entry.index + 1} needs a lower-case dashed id, found "${entry.concept.id ?? ''}"`
        )
      } else if (seen.has(entry.id)) {
        problems.push(`concept id "${entry.id}" is in the file twice`)
      } else {
        seen.add(entry.id)
      }
    }
    if (!seen.size) problems.push(`${basename(file)} lists no concepts to write`)
  }

  const { documents } = topicToFiles(data, { courseId: course, topicId: id })
  const targets = documents.map((document) => join(rootDir, document.path))
  const isFolder = shape === 'map' || shape === 'concepts'

  return { problems, courseId: course, topicId: id, shape, isFolder, target: targets[0], targets }
}

// ── The command ─────────────────────────────────────────────

function printHelp() {
  console.log(`import-content — validate an authored topic file and copy it into the content set

  node scripts/import-content.mjs <file.json> <course-id> [--topic <id>] [--root <dir>]
                                  [--dry-run] [--force] [--no-shuffle]

  The file must pass the same checks as npm run validate:content, including
  prerequisites that point at concepts in other topics. A file whose concepts are
  full objects is written as topic.json plus one file per concept under
  concepts/; each mcq's options are shuffled with a seed taken from the question
  id, so the answer does not always come first and importing twice changes
  nothing. Nothing is written until it passes, and an existing file is only
  replaced with --force.`)
}

function parseArgs(argv) {
  const options = { rootDir: CONTENT_ROOT, dryRun: false, force: false, shuffle: true }
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if (arg === '--topic' && value) {
      options.topicId = value
      index += 1
    } else if (arg === '--root' && value) {
      options.rootDir = resolve(value)
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--no-shuffle') {
      options.shuffle = false
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      positional.push(arg)
    }
  }

  options.file = positional[0] ? resolve(positional[0]) : null
  options.courseId = positional[1] || ''
  return options
}

function loadIncoming(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    return { error: `cannot read ${file} — ${err.message}` }
  }
  try {
    return { data: JSON.parse(text) }
  } catch (err) {
    return { error: `${basename(file)} is not valid JSON — ${err.message}` }
  }
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

const distributionLine = (distribution) =>
  distribution.map((count, index) => `${index}: ${count}`).join(', ')

function runCli(argv) {
  const options = parseArgs(argv)
  if (options.help || !options.file) {
    printHelp()
    return options.file ? 0 : 1
  }

  const incoming = loadIncoming(options.file)
  if (incoming.error) {
    console.error(`import-content: ${incoming.error}`)
    return 1
  }

  const plan = planImport({ ...options, data: incoming.data })
  if (plan.problems.length > 0) {
    console.error(`import-content: cannot import ${basename(options.file)}\n`)
    for (const problem of plan.problems) console.error(`  - ${problem}`)
    return 1
  }

  // The file is built twice: as it arrived, so the warnings describe what was
  // authored, and as it will be written, with the options shuffled.
  const arrived = topicToFiles(incoming.data, {
    courseId: plan.courseId,
    topicId: plan.topicId,
    shuffle: false,
  })
  const written = topicToFiles(incoming.data, {
    courseId: plan.courseId,
    topicId: plan.topicId,
    shuffle: options.shuffle,
  })

  const toTarget = (document) => join(options.rootDir, document.path)
  const toRel = (document) => relative(dirname(options.rootDir), toTarget(document))
  const mine = new Set(written.documents.map((document) => toRel(document)))
  const belongsToImport = (problem) => {
    for (const rel of mine) if (problem.startsWith(rel)) return true
    return false
  }

  // Validate the files that would be written, together with what is already
  // there, but report only what this file is responsible for.
  const existing = readDocuments(options.rootDir)
  const writtenDocuments = written.documents.map((document) => ({
    rel: toRel(document),
    data: document.data,
  }))
  const result = validateDocuments([...existing.documents, ...writtenDocuments])
  const problems = [
    ...writtenDocuments.flatMap((document) => bannedPhraseProblems(document.rel, document.data)),
    ...result.problems.filter(belongsToImport),
  ]

  if (problems.length > 0) {
    console.error(
      `import-content: ${basename(options.file)} has ${plural(problems.length, 'problem')}; nothing written\n`
    )
    for (const problem of problems) {
      const rel = [...mine].find((candidate) => problem.startsWith(candidate))
      const detail = rel ? problem.slice(rel.length).replace(/^[:\s]+/, '') : problem
      console.error(`  - ${rel ? `${rel.replace(/\\/g, '/')}: ` : ''}${detail || 'is unusable'}`)
    }
    return 1
  }

  const arrivedDocuments = arrived.documents.map((document) => ({
    rel: toRel(document),
    data: document.data,
  }))
  const warnings = topicWarnings([...existing.documents, ...arrivedDocuments]).filter(
    (group) => group.topic === plan.topicId
  )

  const answers = mcqAnswers(written.concepts)
  const distribution = indexDistribution(answers)
  const conceptCount =
    plan.shape === 'stub' ? (incoming.data.concepts?.length ?? 0) : written.concepts.length
  const questionCount = result.counts.questions

  if (existsSync(plan.target) && !options.force) {
    console.error(
      `import-content: ${relative(PROJECT_ROOT, plan.target) || plan.target} is already there — pass --force to replace it`
    )
    return 1
  }

  const label =
    `${basename(options.file)} is valid (${plural(conceptCount, 'concept')}, ` +
    `${plural(questionCount, 'question')} in the set)`

  for (const document of options.dryRun ? [] : written.documents) {
    const target = toTarget(document)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(document.data, null, 2)}\n`, 'utf8')
  }

  console.log(`import-content: ${label}`)
  for (const document of written.documents) {
    const target = relative(PROJECT_ROOT, toTarget(document)) || toTarget(document)
    console.log(`  ${options.dryRun ? 'would write' : 'wrote'} ${target}`)
  }

  if (answers.length > 0) {
    console.log(
      options.shuffle
        ? `  shuffled ${plural(answers.length, 'multiple-choice question')}; correct answers now sit at ${distributionLine(distribution)}`
        : `  left ${plural(answers.length, 'multiple-choice question')} in the authored order`
    )
  }

  if (warnings.length > 0) {
    const lines = warnings.flatMap((group) => group.messages)
    console.log(
      `\nimport-content: ${plural(lines.length, 'warning')} for ${plan.topicId} — imported anyway:`
    )
    for (const message of lines) console.log(`  - ${message}`)
  }

  console.log('\nnext:')
  console.log('  npm run validate:content')
  if (plan.shape === 'stub') {
    console.log('  note: a list of concept ids is a stub; the concept objects live in their own files')
  }
  if (plan.courseId === 'os' && !readFileSync(LOADER_FILE, 'utf8').includes(`'${plan.topicId}'`)) {
    console.log(
      `  note: add '${plan.topicId}' to COURSE.topicIds in src/content/os/index.js, or the course page will not list it`
    )
  }
  console.log('  npm run check:links   (only once the resources are real)')
  return 0
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2))
}
