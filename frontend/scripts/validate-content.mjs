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
 *
 * Warnings are the other half. They never fail the run: they say a topic reads
 * as machine-written, or padded, and leave the judgement to a human.
 *
 *   - the multiple-choice answers all sit at the same index (> 60%)
 *   - the correct option is the longest option (> 60%) — an answer written
 *     first with the other options filled around it
 *   - one resource URL is reused across more than two concepts of a topic
 *   - a stem repeats a concept title verbatim with no number, code or scenario
 *     to make it concrete: "possibly generic"
 *
 * Only the authored question bank is measured, not the checks written into a
 * lesson's study notes: notes are written by hand and read in place, while the
 * bank is what a session asks. The share rules need at least MCQ_BIAS_MIN
 * questions before a share means anything.
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

/** Warnings: the lines a topic crosses before it is worth a second look. */
export const MCQ_BIAS_MIN = 4
export const MCQ_INDEX_SHARE = 0.6
export const LONGEST_OPTION_SHARE = 0.6
export const SHARED_RESOURCE_CONCEPTS = 2

/** Stem words that make a question concrete, so it is not a bare definition. */
export const SCENARIO_WORDS = [
  'if',
  'when',
  'suppose',
  'scenario',
  'given',
  'consider',
  'assume',
  'trace',
  'worked',
  'example',
  'above',
  'below',
  'table',
  'diagram',
  'figure',
  'compare',
]

const SCENARIO_PATTERN = new RegExp(`\\b(${SCENARIO_WORDS.join('|')})\\b`, 'i')

/** A number, a snippet or an identifier makes a stem concrete on its own. */
const CODE_PATTERN = /[`{}[\]<>;]|\w+\(\)|\b\w+_\w+\b|->|::/

/**
 * One URL, one resource: the host is normalised by dropping "www." and a
 * trailing slash is ignored, so the same page authored twice counts once.
 * Everything else about the URL is left exactly as authored.
 */
export function normalizeResourceUrl(url) {
  if (typeof url !== 'string') return url
  let normalised = url.trim()
  if (normalised === '') return normalised
  normalised = normalised.replace(/\/+$/, '')
  normalised = normalised.replace(/^([a-z][a-z0-9+.-]*:\/\/)www\./i, '$1')
  return normalised
}

// `verifiedOn` is deliberately not here: only a human can set the date a link
// was last opened, so a resource authored elsewhere is valid without it. When
// it is present it must be an ISO date (checked below).
const RESOURCE_FIELDS = ['title', 'url', 'type', 'provider', 'license', 'estMinutes', 'why']

const QUESTION_FIELDS = ['id', 'type', 'bloom', 'difficulty', 'prompt', 'explanation']

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isFilled = (value) => typeof value === 'string' && value.trim().length > 0

// A subject is a slug: lower-case words joined by single hyphens, e.g.
// "operating-systems". It is what the library groups a concept under, so it is
// checked here rather than left to whichever screen shows it.
const SUBJECT_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const isSubjectSlug = (value) => typeof value === 'string' && SUBJECT_SLUG.test(value)

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

/** A concept that lives in its own file: `<topic>/concepts/<concept-id>.json`. */
function isConceptPath(rel) {
  return /(^|[/\\])concepts[/\\][^/\\]+\.json$/i.test(String(rel ?? ''))
}

/**
 * The kind of document a parsed file is. A folder topic may list its concepts in
 * topic.json and hold each one in `concepts/<id>.json`, so the path a document
 * came from is part of what it is.
 */
function documentKind(data, rel = '') {
  if (!isObject(data)) return 'unknown'
  if ('concepts' in data || 'conceptIds' in data || 'conceptRefs' in data) return 'topic'
  if ('blocks' in data || 'check' in data) return 'lesson'
  if (isConceptPath(rel) || 'questions' in data || 'resources' in data || 'prerequisiteIds' in data) {
    return 'concept'
  }
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

// ── Warnings — never failures ───────────────────────────────

/** The topic a document belongs to: its folder, or its own name for a flat file. */
function topicOfDocument(rel, kind) {
  const parts = String(rel ?? '').split(/[\\/]/).filter(Boolean)
  const file = parts[parts.length - 1] ?? ''
  const stem = file.replace(/\.json$/i, '')
  const folders = parts.slice(0, -1)
  const parent = folders[folders.length - 1] ?? stem

  if (kind === 'concept' && parent === 'concepts') return folders[folders.length - 2] ?? stem
  if (kind === 'lesson') return parent
  return stem === 'topic' || stem === '' ? parent : stem
}

/** Every topic's authored concepts, whichever file shape they arrived in. */
function conceptRecords(documents) {
  const byTopic = new Map()
  const bucket = (topic) => {
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    return byTopic.get(topic)
  }

  for (const { rel, data } of documents) {
    const kind = documentKind(data, rel)
    if (kind === 'concept') {
      bucket(topicOfDocument(rel, kind)).push({ concept: data })
      continue
    }
    if (kind !== 'topic' || !isObject(data.concepts)) continue
    for (const [key, seed] of Object.entries(data.concepts)) {
      if (!isObject(seed)) continue
      bucket(topicOfDocument(rel, kind)).push({ concept: { id: key, ...seed } })
    }
  }

  return byTopic
}

const shareLabel = (share) => `${Math.round(share * 100)}%`

/** The multiple-choice questions a topic's concepts author. */
function authoredMcqs(concepts) {
  const mcqs = []
  for (const { concept } of concepts) {
    for (const question of Array.isArray(concept.questions) ? concept.questions : []) {
      if (!isObject(question) || question.type !== 'mcq') continue
      if (!Array.isArray(question.options) || question.options.length === 0) continue
      mcqs.push(question)
    }
  }
  return mcqs
}

/** Where the correct answers sit: a file with them all in one place is a draft. */
function answerIndexWarnings(mcqs) {
  const counts = new Map()
  for (const question of mcqs) {
    const index = Number(question.correctIndex)
    if (!Number.isInteger(index) || index < 0 || index >= question.options.length) continue
    counts.set(index, (counts.get(index) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  if (ranked.length === 0) return []
  const [index, count] = ranked[0]
  const share = count / mcqs.length
  if (share <= MCQ_INDEX_SHARE) return []

  return [
    `${count} of ${mcqs.length} multiple-choice questions put the correct answer at index ${index} ` +
      `(${shareLabel(share)}, over ${shareLabel(MCQ_INDEX_SHARE)}) — move the answers around, or import the file so the options are shuffled`,
  ]
}

/** The correct option being the longest: what an answer-first draft looks like. */
function longestOptionWarnings(mcqs) {
  const longest = mcqs.filter((question) => {
    const index = Number(question.correctIndex)
    if (!Number.isInteger(index) || index < 0 || index >= question.options.length) return false
    const lengths = question.options.map((option) => String(option).trim().length)
    return lengths[index] >= Math.max(...lengths)
  }).length

  const share = longest / mcqs.length
  if (share <= LONGEST_OPTION_SHARE) return []

  return [
    `the correct option is the longest option in ${longest} of ${mcqs.length} multiple-choice questions ` +
      `(${shareLabel(share)}, over ${shareLabel(LONGEST_OPTION_SHARE)}) — the tell of an answer written before its distractors`,
  ]
}

/** One URL used across a topic's concepts: usually filler, not study material. */
function sharedResourceWarnings(concepts) {
  const byUrl = new Map()
  for (const { concept } of concepts) {
    const id = isFilled(concept.id) ? concept.id : String(concept.title ?? '')
    for (const resource of Array.isArray(concept.resources) ? concept.resources : []) {
      if (!isObject(resource) || !isFilled(resource.url)) continue
      const key = normalizeResourceUrl(resource.url)
      if (!byUrl.has(key)) byUrl.set(key, new Set())
      byUrl.get(key).add(id)
    }
  }

  const warnings = []
  for (const [url, seenOn] of [...byUrl.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (seenOn.size > SHARED_RESOURCE_CONCEPTS) {
      warnings.push(
        `resource ${url} is on ${seenOn.size} concepts — a link on more than ${SHARED_RESOURCE_CONCEPTS} concepts is usually filler`
      )
    }
  }
  return warnings
}

/** The concept title a stem leans on, when the stem is nothing but that title. */
function genericTitleFor(prompt, titles) {
  const lower = String(prompt).toLowerCase()
  const title = titles.find((candidate) => lower.includes(candidate.toLowerCase()))
  if (!title) return null
  if (/\d/.test(prompt)) return null
  if (CODE_PATTERN.test(prompt)) return null
  if (SCENARIO_PATTERN.test(prompt)) return null
  return title
}

/** A stem that names a concept and asks nothing else: possibly generic. */
function genericStemWarnings(concepts) {
  const titles = concepts
    .map(({ concept }) => String(concept.title ?? '').trim())
    .filter((title) => title.length >= 4)

  const warnings = []
  for (const { concept } of concepts) {
    for (const question of Array.isArray(concept.questions) ? concept.questions : []) {
      if (!isObject(question) || !isFilled(question.prompt)) continue
      const title = genericTitleFor(question.prompt, titles)
      if (!title) continue
      warnings.push(
        `question "${question.id ?? '?'}" may be generic: it repeats the concept title ` +
          `"${title}" with no number, code or scenario to pin it down`
      )
    }
  }
  return warnings
}

/**
 * Warnings for the topics that earned one, ordered by topic. Each entry is
 * `{ topic, messages }`; nothing here ever fails a run.
 */
export function topicWarnings(documents) {
  const groups = []

  for (const [topic, concepts] of [...conceptRecords(documents).entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const mcqs = authoredMcqs(concepts)
    const measurable = mcqs.length >= MCQ_BIAS_MIN
    const messages = [
      ...(measurable ? answerIndexWarnings(mcqs) : []),
      ...(measurable ? longestOptionWarnings(mcqs) : []),
      ...sharedResourceWarnings(concepts),
      ...genericStemWarnings(concepts),
    ]
    if (messages.length > 0) groups.push({ topic, messages })
  }

  return groups
}

/** Validate already-parsed documents. Pure: no filesystem, no exit. */
export function validateDocuments(documents) {
  const report = new Report()
  const seenConceptIds = new Map()
  const seenLessonIds = new Map()
  const seenQuestionIds = new Map()
  const conceptSeeds = []
  const conceptRefs = []

  for (const { rel, data } of documents) {
    const kind = documentKind(data, rel)
    if (kind === 'unknown') {
      report.add(
        rel,
        'is neither a topic (has "concepts", "conceptIds" or "conceptRefs"), a lesson (has "blocks") nor a concept (has "questions")'
      )
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

    // concept — its own file, holding questions and/or study material
    if (kind === 'concept') {
      const id = isFilled(data.id) ? data.id : null
      if (!id) report.add(rel, 'concept is missing an id')
      else if (seenConceptIds.has(id)) {
        report.add(rel, `concept id "${id}" is already used by ${seenConceptIds.get(id)}`)
      } else {
        seenConceptIds.set(id, rel)
      }
      if (!isFilled(data.title)) report.add(rel, 'concept is missing a title')
      if (!isFilled(data.subject)) report.add(rel, 'concept is missing a subject')
      else if (!isSubjectSlug(data.subject)) {
        report.add(rel, `subject "${data.subject}" must be a lower-case slug`)
      }
      if (data.prerequisiteIds !== undefined && !Array.isArray(data.prerequisiteIds)) {
        report.add(rel, 'prerequisiteIds must be an array')
      }
      checkResources(data.resources, rel, report)
      checkQuestions(data.questions, rel, report, seenQuestionIds)
      conceptSeeds.push({ where: rel, seed: data })
      continue
    }

    // topic
    const { concepts } = data

    // A topic carries its subject once. Concepts in a folder topic get theirs
    // from their own file; inline concepts and bare ids inherit it from here,
    // so every concept in the library can answer "which subject am I under?".
    const topicSubject = isFilled(data.subject) ? data.subject : null
    if (!topicSubject) report.add(rel, 'topic is missing a subject')
    else if (!isSubjectSlug(data.subject)) {
      report.add(rel, `subject "${data.subject}" must be a lower-case slug`)
    }

    // A topic may reuse a concept another topic (or course) defines instead of
    // copying it. The ref is resolved once every context has been read.
    if (data.conceptRefs !== undefined) {
      if (!Array.isArray(data.conceptRefs)) {
        report.add(rel, 'conceptRefs must be an array of concept ids')
      } else {
        conceptRefs.push({ where: rel, refs: data.conceptRefs })
      }
    }

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
      if (concepts !== undefined) {
        report.add(rel, 'concepts must be an array or an object')
        continue
      }
      // A folder topic whose concepts are each in their own file.
      if (data.conceptIds !== undefined && !Array.isArray(data.conceptIds)) {
        report.add(rel, 'conceptIds must be an array of concept ids')
      }
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
      const subject = isFilled(seed.subject) ? seed.subject : topicSubject
      if (!subject) report.add(where, 'concept is missing a subject')
      else if (!isSubjectSlug(subject)) {
        report.add(where, `subject "${subject}" must be a lower-case slug`)
      }
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

  // A conceptRef is not a second definition: it must point at one that exists.
  for (const { where, refs } of conceptRefs) {
    refs.forEach((ref, index) => {
      if (!isFilled(ref)) {
        report.add(`${where} conceptRefs[${index}]`, 'conceptRef must be a string')
      } else if (!seenConceptIds.has(ref)) {
        report.add(`${where} conceptRefs[${index}]`, `conceptRef "${ref}" is not a concept in this content set`)
      }
    })
  }

  return {
    problems: report.problems,
    warnings: topicWarnings(documents),
    counts: {
      concepts: seenConceptIds.size,
      lessons: seenLessonIds.size,
      questions: seenQuestionIds.size,
    },
  }
}

/** Read + validate a content root. Returns problems, warnings and counts. */
export function validateContent(rootDir = CONTENT_ROOT) {
  const { files, documents, problems } = readDocuments(rootDir)

  if (files.length === 0) {
    return {
      problems: problems.length > 0 ? problems : [`no .json files found under ${rootDir}`],
      warnings: [],
      counts: {},
      files,
    }
  }

  const result = validateDocuments(documents)
  return {
    problems: [...problems, ...result.problems],
    warnings: result.warnings,
    counts: result.counts,
    files,
  }
}

function runCli() {
  const { problems, warnings, counts, files } = validateContent(CONTENT_ROOT)

  if (problems.length > 0) {
    console.error(`validate-content: ${problems.length} problem(s) across ${files.length} file(s)\n`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log(
    `validate-content: OK - ${files.length} files parsed (` +
      `${counts.concepts} concepts, ${counts.questions} questions, ${counts.lessons} lessons), no problems`
  )

  if (warnings.length > 0) {
    const lines = warnings.reduce((sum, group) => sum + group.messages.length, 0)
    console.log(
      `\nvalidate-content: ${lines} warning(s) in ${warnings.length} topic(s) — not failures, but worth a look`
    )
    for (const group of warnings) {
      console.log(`  ${group.topic}`)
      for (const message of group.messages) console.log(`    - ${message}`)
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli()
}
