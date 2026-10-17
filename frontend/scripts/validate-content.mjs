#!/usr/bin/env node
/**
 * validate-content — guard the course content against shipping mistakes.
 *
 * Walks src/content, JSON.parses every .json file, and reports:
 *   - files that are not valid JSON
 *   - any string containing a banned phrase ("wait,", "let me recalculate", "TODO")
 *
 * Exits non-zero on the first run that finds a problem, so CI fails loudly.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')
const CONTENT_ROOT = join(PROJECT_ROOT, 'src', 'content')

const BANNED = ['wait,', 'let me recalculate', 'TODO']

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.name.endsWith('.json')) files.push(full)
  }
  return files
}

/** Collect every string in a parsed document, with a readable path. */
function collectStrings(value, path, out) {
  if (typeof value === 'string') {
    out.push({ path, text: value })
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, path ? `${path}.${key}` : key, out)
    }
  }
}

let files
try {
  files = walk(CONTENT_ROOT).sort()
} catch (err) {
  console.error(`validate-content: cannot read ${CONTENT_ROOT} — ${err.message}`)
  process.exit(1)
}

if (files.length === 0) {
  console.error(`validate-content: no .json files found under ${CONTENT_ROOT}`)
  process.exit(1)
}

const problems = []

for (const file of files) {
  const rel = relative(PROJECT_ROOT, file)
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    problems.push(`${rel}: invalid JSON — ${err.message}`)
    continue
  }

  const strings = []
  collectStrings(data, '', strings)
  for (const { path, text } of strings) {
    for (const phrase of BANNED) {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        problems.push(`${rel} (${path || 'root'}): contains banned phrase "${phrase}"`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error(
    `validate-content: ${problems.length} problem(s) across ${files.length} file(s)\n`
  )
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`validate-content: OK - ${files.length} files parsed, no banned phrases`)
