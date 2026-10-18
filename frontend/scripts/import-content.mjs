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
 *
 * The file is checked with exactly the rules `npm run validate:content` applies,
 * and against the concepts already in the content set, so prerequisites that
 * point at another topic resolve instead of looking missing. Nothing is written
 * until it passes.
 *
 * Where it lands:
 *   concepts is an object  ->  <root>/<course-id>/<topic-id>/topic.json
 *   concepts is a list     ->  <root>/<course-id>/<topic-id>.json
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
  readDocuments,
  validateDocuments,
} from './validate-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')
const LOADER_FILE = join(PROJECT_ROOT, 'src', 'content', 'os', 'index.js')

const TOPIC_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugFromFile(file) {
  return basename(file).replace(/\.json$/i, '').toLowerCase()
}

/**
 * Structure the destination path, or explain why the file cannot be imported.
 * Returns { problems, courseId, topicId, isFolder, target }.
 */
export function planImport({ data, file, courseId, topicId, rootDir = CONTENT_ROOT }) {
  const problems = []
  const id = topicId || data?.id || data?.topicId || slugFromFile(file)
  const course = courseId || ''

  if (!course) problems.push('a course id is required, e.g. `import-content.mjs topic.json os`')
  if (!id || !TOPIC_ID.test(id)) {
    problems.push(
      `topic id "${id || ''}" must be lower-case words separated by dashes (pass --topic <id> to set it)`
    )
  }

  const isTopic = data && typeof data === 'object' && 'concepts' in data
  const isLesson = data && typeof data === 'object' && ('blocks' in data || 'check' in data)
  if (!isTopic) {
    problems.push(
      isLesson
        ? `${basename(file)} is a lesson — only topic files are imported; lessons are authored where the topic points`
        : `${basename(file)} has no "concepts", so there is nothing to import`
    )
  }

  const isFolder = isTopic && !Array.isArray(data.concepts)
  const target = isFolder
    ? join(rootDir, course, id, 'topic.json')
    : join(rootDir, course, `${id}.json`)

  return { problems, courseId: course, topicId: id, isFolder, target }
}

function printHelp() {
  console.log(`import-content — validate an authored topic file and copy it into the content set

  node scripts/import-content.mjs <file.json> <course-id> [--topic <id>] [--root <dir>]
                                  [--dry-run] [--force]

  The file must pass the same checks as npm run validate:content, including
  prerequisites that point at concepts in other topics. Nothing is written until
  it passes, and an existing file is only replaced with --force.`)
}

function parseArgs(argv) {
  const options = { rootDir: CONTENT_ROOT, dryRun: false, force: false }
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

  // Validate the incoming file together with what is already there, but report
  // only what the incoming file is responsible for.
  const rel = `<import>/${plan.courseId}/${plan.topicId}/${basename(plan.target)}`
  const existing = readDocuments(options.rootDir)
  const result = validateDocuments([...existing.documents, { rel, data: incoming.data }])
  const problems = [
    ...bannedPhraseProblems(rel, incoming.data),
    ...result.problems.filter((problem) => problem.startsWith(rel)),
  ]

  if (problems.length > 0) {
    console.error(
      `import-content: ${basename(options.file)} has ${plural(problems.length, 'problem')}; nothing written\n`
    )
    for (const problem of problems) {
      console.error(`  - ${problem.slice(rel.length).replace(/^[:\s]+/, '') || 'is unusable'}`)
    }
    return 1
  }

  const shown = relative(PROJECT_ROOT, plan.target) || plan.target
  const conceptCount = Array.isArray(incoming.data.concepts)
    ? incoming.data.concepts.length
    : Object.keys(incoming.data.concepts).length
  const questionCount = result.counts.questions

  if (existsSync(plan.target) && !options.force) {
    console.error(
      `import-content: ${shown} is already there — pass --force to replace it`
    )
    return 1
  }

  if (options.dryRun) {
    console.log(
      `import-content: ${basename(options.file)} is valid (${plural(conceptCount, 'concept')}, ` +
        `${plural(questionCount, 'question')} in the set)`
    )
    console.log(`  would write ${shown}${existsSync(plan.target) ? ' (replacing what is there)' : ''}`)
    return 0
  }

  mkdirSync(dirname(plan.target), { recursive: true })
  writeFileSync(plan.target, `${JSON.stringify(incoming.data, null, 2)}\n`, 'utf8')

  console.log(
    `import-content: wrote ${shown} (${plural(conceptCount, 'concept')}, ` +
      `${plural(questionCount, 'question')} in the set)`
  )
  console.log('\nnext:')
  console.log('  npm run validate:content')
  if (!plan.isFolder) {
    console.log(`  note: a list of concept ids is a stub; the concept objects live in their own files`)
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
