#!/usr/bin/env node
/**
 * validate-content — guard the course content against shipping mistakes.
 *
 * Walks a content root (default src/content) and checks everything the app
 * assumes about the authored files:
 *
 *   shape
 *     - every .json file parses
 *     - each document is a topic (has `concepts`) or a lesson (has `blocks`/`check`)
 *     - concepts are objects with a title
 *     - concept ids and lesson ids are unique across the content set
 *     - question ids are unique across the content set
 *
 *   links between documents
 *     - every prerequisiteIds entry names a concept that exists
 *
 *   questions
 *     - id, type, bloom, difficulty, prompt, explanation, needsHumanCheck
 *     - mcq: exactly four distinct options, correctIndex inside them
 *     - short: an answerKey, and rubric points that sum above zero
 *     - the same rules apply to a lesson's `check` blocks
 *
 *   resources
 *     - title, url, type, provider, license, estMinutes, why, verifiedOn
 *     - https URLs only, at most 3 resources per concept
 *
 *   wording
 *     - drafting phrases ("wait,", "let me recalculate", "TODO")
 *
 * Exits non-zero when anything is wrong, so CI fails loudly. The pure entry
 * point (validateContent) is exported so tests can run it over a fixture tree.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')
export const CONTENT_ROOT = join(PROJECT_ROOT, 'src', 'content')

export const BANNED_PHRASES = ['wait,', 'let me recalculate', 'TODO']

export const QUESTION_TYPES = ['mcq', 'short']
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
export const DIFFICULTIES = ['easy', 'medium', 'hard']
export const RESOURCE_TYPES = ['article', 'video', 'book', 'docs', 'interactive', 'notes']

export const MAX_RESOURCES_PER_CONCEPT = 3
export const MCQ_OPTION_COUNT = 4

const RESOURCE_FIELDS = [
  'title',
  'url',
  'type',
  'provider',
  'license',
  'estMinutes',
  'why',
  'verifiedOn',
]

const QUESTION_FIELDS = ['id', 'type', 'bloom', 'difficulty', 'prompt', 'explanation']

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isFilled = (value) => typeof value === 'string' && value.trim().length > 0

function walkJson(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkJson(full))
    else if (entry.name.endsWith('.json')) files.push(full)
  }
  return files
}

/** Every string in a parsed document, with a readable path. */
function collectStrings(value, path, out) {
  if (typeof value === 'string') {
    out.push({ path, text: value })
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out))
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, path ? `${path}.${key}` : key, out)
    }
  }
}

/** Wording rules for one document, checked before anything structural. */
export function bannedPhraseProblems(rel, data) {
  const problems = []
  const strings = []
  collectStrings(data, '', strings)
  for (const { path, text } of strings) {
    for (const phrase of BANNED_PHRASES) {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        problems.push(`${rel} (${path || 'root'}): contains banned phrase "${phrase}"`)
      }
    }
  }
  return problems
}

/**
 * Parse and wording-scan every .json under a root.
 * Returns { files, documents: [{ rel, data }], problems }.
 */
export function readDocuments(rootDir = CONTENT_ROOT) {
  let files
  try {
    files = walkJson(rootDir).sort()
  } catch (err) {
    return { files: [], documents: [], problems: [`cannot read ${rootDir} — ${err.message}`] }
  }

  const documents = []
  const problems = []

  for (const file of files) {
    const rel = relative(dirname(rootDir), file)
    let data
    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      problems.push(`${rel}: invalid JSON — ${err.message}`)
      continue
    }
    problems.push(...bannedPhraseProblems(rel, data))
    documents.push({ rel, data })
  }

  return { files, documents, problems }
}

/** The kind of document a parsed file is, by the keys it carries. */
function documentKind(data) {
  if (!isObject(data)) return 'unknown'
  if ('concepts' in data) return 'topic'
  if ('blocks' in data || 'check' in data) return 'lesson'
  return 'unknown'
}

class Report {
  constructor() {
    this.problems = []
  }

  add(where, message) {
    this.problems.push(`${where}: ${message}`)
  }
}

function checkResource(resource, where, report) {
  if (!isObject(resource)) {
    report.add(where, 'resource is not an object')
    return
  }
  for (const field of RESOURCE_FIELDS) {
    if (resource[field] === undefined || resource[field] === null || resource[field] === '') {
      report.add(where, `resource is missing "${field}"`)
    }
  }
  if (resource.title !== undefined && !isFilled(resource.title)) {
    report.add(where, 'resource title is empty')
  }
  if (resource.type !== undefined && !RESOURCE_TYPES.includes(resource.type)) {
    report.add(
      where,
      `resource type "${resource.type}" is not one of ${RESOURCE_TYPES.join(', ')}`
    )
  }
  if (resource.url !== undefined) {
    if (!isFilled(resource.url) || !resource.url.startsWith('https://')) {
      report.add(where, `resource url "${resource.url}" must be an https:// URL`)
    }
  }
  if (resource.estMinutes !== undefined) {
    const minutes = Number(resource.estMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      report.add(where, `resource estMinutes "${resource.estMinutes}" must be a positive number`)
    }
  }
  if (resource.verifiedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(resource.verifiedOn))) {
    report.add(where, `resource verifiedOn "${resource.verifiedOn}" must be an ISO date (YYYY-MM-DD)`)
  }
}

function checkQuestion(question, where, report, seenQuestionIds) {
  if (!isObject(question)) {
    report.add(where, 'question is not an object')
    return
  }

  for (const field of QUESTION_FIELDS) {
    if (question[field] === undefined || question[field] === null || question[field] === '') {
      report.add(where, `question is missing "${field}"`)
    }
  }

  if (isFilled(question.id)) {
    if (seenQuestionIds.has(question.id)) {
      report.add(where, `question id "${question.id}" is already used by ${seenQuestionIds.get(question.id)}`)
    } else {
      seenQuestionIds.set(question.id, where)
    }
  }

  if (question.type !== undefined && !QUESTION_TYPES.includes(question.type)) {
    report.add(where, `question type "${question.type}" is not one of ${QUESTION_TYPES.join(', ')}`)
  }
  if (question.bloom !== undefined && !BLOOM_LEVELS.includes(question.bloom)) {
    report.add(where, `question bloom "${question.bloom}" is not one of ${BLOOM_LEVELS.join(', ')}`)
  }
  if (question.difficulty !== undefined && !DIFFICULTIES.includes(question.difficulty)) {
    report.add(
      where,
      `question difficulty "${question.difficulty}" is not one of ${DIFFICULTIES.join(', ')}`
    )
  }
  if (question.needsHumanCheck !== undefined && typeof question.needsHumanCheck !== 'boolean') {
    report.add(where, 'question needsHumanCheck must be true or false')
  }

  if (question.type === 'mcq') {
    const options = question.options
    if (!Array.isArray(options) || options.length !== MCQ_OPTION_COUNT) {
      report.add(
        where,
        `mcq "${question.id ?? '?'}" needs exactly ${MCQ_OPTION_COUNT} options, found ${
          Array.isArray(options) ? options.length : 'none'
        }`
      )
    } else {
      if (!options.every(isFilled)) {
        report.add(where, `mcq "${question.id ?? '?'}" has an empty option`)
      }
      const trimmed = options.map((option) => String(option).trim().toLowerCase())
      if (new Set(trimmed).size !== trimmed.length) {
        report.add(where, `mcq "${question.id ?? '?'}" has duplicate options`)
      }
    }
    const index = question.correctIndex
    const inRange =
      Number.isInteger(index) && Array.isArray(options) && index >= 0 && index < options.length
    if (!inRange) {
      report.add(
        where,
        `mcq "${question.id ?? '?'}" correctIndex "${index}" is not one of its options`
      )
    }
  }

  if (question.type === 'short') {
    if (!isFilled(question.answerKey)) {
      report.add(where, `short question "${question.id ?? '?'}" needs an answerKey`)
    }
    const rubric = question.rubric
    if (!Array.isArray(rubric) || rubric.length === 0) {
      report.add(where, `short question "${question.id ?? '?'}" needs a rubric`)
    } else {
      let sum = 0
      rubric.forEach((criterion, index) => {
        if (!isObject(criterion)) {
          report.add(where, `rubric[${index}] is not an object`)
          return
        }
        if (!isFilled(criterion.criterion)) {
          report.add(where, `rubric[${index}] is missing a criterion`)
        }
        const points = Number(criterion.points)
        if (!Number.isFinite(points) || points <= 0) {
          report.add(where, `rubric[${index}] points "${criterion.points}" must be a positive number`)
        } else {
          sum += points
        }
      })
      if (sum <= 0) {
        report.add(where, `short question "${question.id ?? '?'}" rubric points must sum above zero`)
      }
    }
  }
}

function checkResources(resources, where, report) {
  if (resources === undefined) return
  if (!Array.isArray(resources)) {
    report.add(where, 'resources must be an array')
    return
  }
  if (resources.length > MAX_RESOURCES_PER_CONCEPT) {
    report.add(
      where,
      `${resources.length} resources on one concept — at most ${MAX_RESOURCES_PER_CONCEPT}`
    )
  }
  resources.forEach((resource, index) => checkResource(resource, `${where} resources[${index}]`, report))
}

function checkQuestions(questions, where, report, seenQuestionIds) {
  if (questions === undefined) return
  if (!Array.isArray(questions)) {
    report.add(where, 'questions must be an array')
    return
  }
  questions.forEach((question, index) =>
    checkQuestion(question, `${where} questions[${index}]`, report, seenQuestionIds)
  )
}

/** Validate already-parsed documents. Pure: no filesystem, no exit. */
export function validateDocuments(documents) {
  const report = new Report()
  const seenConceptIds = new Map()
  const seenLessonIds = new Map()
  const seenQuestionIds = new Map()
  const conceptSeeds = []

  for (const { rel, data } of documents) {
    const kind = documentKind(data)
    if (kind === 'unknown') {
      report.add(rel, 'is neither a topic (has "concepts") nor a lesson (has "blocks")')
      continue
    }

    if (kind === 'lesson') {
      if (!isFilled(data.id)) report.add(rel, 'lesson is missing an id')
      else if (seenLessonIds.has(data.id)) {
        report.add(rel, `lesson id "${data.id}" is already used by ${seenLessonIds.get(data.id)}`)
      } else {
        seenLessonIds.set(data.id, rel)
      }
      if (!isFilled(data.title)) report.add(rel, 'lesson is missing a title')

      const blocks = Array.isArray(data.blocks) ? data.blocks : []
      blocks.forEach((block, index) => {
        if (isObject(block) && block.kind === 'check') {
          // A lesson check is an mcq without a bloom/difficulty/type envelope.
          checkQuestion(
            {
              ...block,
              id: block.id ?? `${data.id ?? 'lesson'}-check-${index}`,
              type: 'mcq',
              bloom: block.bloom ?? 'understand',
              difficulty: block.difficulty ?? 'medium',
              prompt: block.prompt ?? block.question,
              explanation: block.explanation ?? '',
              needsHumanCheck: block.needsHumanCheck ?? true,
            },
            `${rel} blocks[${index}]`,
            report,
            seenQuestionIds
          )
        }
      })
      continue
    }

    // topic
    const { concepts } = data
    if (Array.isArray(concepts)) {
      concepts.forEach((id, index) => {
        if (!isFilled(id)) {
          report.add(`${rel} concepts[${index}]`, 'concept id must be a string')
          return
        }
        if (seenConceptIds.has(id)) {
          report.add(`${rel} concepts[${index}]`, `concept id "${id}" is already used by ${seenConceptIds.get(id)}`)
        } else {
          seenConceptIds.set(id, rel)
        }
      })
      continue
    }

    if (!isObject(concepts)) {
      report.add(rel, 'concepts must be an array or an object')
      continue
    }

    for (const [key, seed] of Object.entries(concepts)) {
      const where = `${rel} concepts.${key}`
      if (!isObject(seed)) {
        report.add(where, 'concept is not an object')
        continue
      }
      const id = isFilled(seed.id) ? seed.id : key
      if (seenConceptIds.has(id)) {
        report.add(where, `concept id "${id}" is already used by ${seenConceptIds.get(id)}`)
      } else {
        seenConceptIds.set(id, rel)
      }
      if (!isFilled(seed.title)) report.add(where, 'concept is missing a title')
      if (seed.prerequisiteIds !== undefined && !Array.isArray(seed.prerequisiteIds)) {
        report.add(where, 'prerequisiteIds must be an array')
      }
      checkResources(seed.resources, where, report)
      checkQuestions(seed.questions, where, report, seenQuestionIds)
      conceptSeeds.push({ where, seed })
    }
  }

  // Prerequisites are validated once every concept id is known.
  for (const { where, seed } of conceptSeeds) {
    if (!Array.isArray(seed.prerequisiteIds)) continue
    for (const prerequisite of seed.prerequisiteIds) {
      if (!seenConceptIds.has(prerequisite)) {
        report.add(where, `prerequisite "${prerequisite}" is not a concept in this content set`)
      }
    }
  }

  return { problems: report.problems, counts: {
    concepts: seenConceptIds.size,
    lessons: seenLessonIds.size,
    questions: seenQuestionIds.size,
  } }
}

/** Read + validate a content root. Returns problems and counts; never throws. */
export function validateContent(rootDir = CONTENT_ROOT) {
  const { files, documents, problems } = readDocuments(rootDir)

  if (files.length === 0) {
    return {
      problems: problems.length > 0 ? problems : [`no .json files found under ${rootDir}`],
      counts: {},
      files,
    }
  }

  const result = validateDocuments(documents)
  return { problems: [...problems, ...result.problems], counts: result.counts, files }
}

function runCli() {
  const { problems, counts, files } = validateContent(CONTENT_ROOT)

  if (problems.length > 0) {
    console.error(`validate-content: ${problems.length} problem(s) across ${files.length} file(s)\n`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log(
    `validate-content: OK - ${files.length} files parsed (` +
      `${counts.concepts} concepts, ${counts.questions} questions, ${counts.lessons} lessons), no problems`
  )
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli()
}
