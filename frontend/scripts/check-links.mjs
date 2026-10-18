#!/usr/bin/env node
/**
 * check-links — fetch every study-material resource URL and report what happens.
 *
 * Not part of the build. Run it by hand (or on a schedule) before marking a
 * resource `verifiedOn`, and read the report:
 *
 *   node scripts/check-links.mjs [--root src/content] [--out link-report.json]
 *                               [--timeout 10000] [--concurrency 4]
 *
 * For each URL the report records the HTTP status, the page title and where the
 * resource is used, and classifies the result:
 *
 *   ok         2xx
 *   hand-check 403, 429 or 999 — the site is refusing a script, not broken.
 *              Open it in a browser before deciding.
 *   broken     anything else, including timeouts and network errors
 *
 * Only a human edits content: this script never writes `verifiedOn`.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeResourceUrl } from './validate-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')

export const DEFAULT_ROOT = join(PROJECT_ROOT, 'src', 'content')
export const DEFAULT_OUT = join(PROJECT_ROOT, 'link-report.json')
export const DEFAULT_TIMEOUT_MS = 10000
export const DEFAULT_CONCURRENCY = 4

/** Statuses that mean "a script is not welcome", not "the link is dead". */
export const HAND_CHECK_STATUSES = [403, 429, 999]

const MAX_BODY_BYTES = 200_000

function walkJson(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkJson(full))
    else if (entry.name.endsWith('.json')) files.push(full)
  }
  return files
}

/**
 * Every resource URL in the content, with the concepts that use it. A concept
 * is found whether it sits in a topic's `concepts` map or in a file of its own
 * under `concepts/`, and the same URL authored with a leading "www." or a
 * trailing slash counts once. Returns [{ url, where: string[] }], sorted by url.
 */
export function collectResourceUrls(rootDir = DEFAULT_ROOT) {
  let files
  try {
    files = walkJson(rootDir).sort()
  } catch {
    return []
  }

  const byUrl = new Map()

  const add = (url, where) => {
    if (typeof url !== 'string' || url.trim() === '') return
    const key = normalizeResourceUrl(url)
    if (!byUrl.has(key)) byUrl.set(key, new Set())
    byUrl.get(key).add(where)
  }

  for (const file of files) {
    let data
    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    if (!data || typeof data !== 'object') continue

    for (const concept of conceptsIn(file, data)) {
      const where = concept.title || concept.id || 'a concept'
      for (const resource of Array.isArray(concept.resources) ? concept.resources : []) {
        if (resource && typeof resource === 'object') add(resource.url, where)
      }
    }
  }

  return [...byUrl.entries()]
    .map(([url, where]) => ({ url, where: [...where].sort() }))
    .sort((a, b) => a.url.localeCompare(b.url))
}

/** The concepts a parsed file carries: a topic's map, or a concept file of its own. */
function conceptsIn(file, data) {
  if (Array.isArray(data.concepts)) return []
  if (data.concepts && typeof data.concepts === 'object') {
    return Object.values(data.concepts).filter((seed) => seed && typeof seed === 'object')
  }

  const ownFile =
    /(^|[/\\])concepts[/\\][^/\\]+\.json$/i.test(file) ||
    'questions' in data ||
    'resources' in data ||
    'prerequisiteIds' in data

  return ownFile ? [data] : []
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** The <title> of an HTML body, or null. */
export function extractTitle(body, contentType = '') {
  if (typeof body !== 'string' || body === '') return null
  if (contentType && !contentType.includes('html')) return null
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return null
  const title = decodeEntities(match[1]).replace(/\s+/g, ' ').trim()
  return title ? title.slice(0, 200) : null
}

export function classifyStatus(status) {
  if (Number.isInteger(status) && status >= 200 && status < 300) return 'ok'
  if (HAND_CHECK_STATUSES.includes(status)) return 'hand-check'
  return 'broken'
}

/** Check one URL. `fetchImpl` is injected so tests never touch the network. */
export async function checkUrl(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'querymind-link-check/1.0 (+content review)' },
    })

    const result = classifyStatus(response.status)
    let title = null
    if (result !== 'hand-check' && typeof response.text === 'function') {
      const contentType = response.headers?.get?.('content-type') || ''
      if (result === 'ok' && contentType.includes('html')) {
        const body = await response.text()
        title = extractTitle(body.slice(0, MAX_BODY_BYTES), contentType)
      }
    }

    return { url, status: response.status, result, title, error: null }
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return {
      url,
      status: null,
      result: 'broken',
      title: null,
      error: aborted ? `timed out after ${timeoutMs}ms` : err?.message || String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Check many URLs with a bounded number in flight. */
export async function checkLinks(entries, options = {}) {
  const { concurrency = DEFAULT_CONCURRENCY } = options
  const results = new Array(entries.length)
  let next = 0

  async function worker() {
    while (next < entries.length) {
      const index = next
      next += 1
      const entry = entries[index]
      const outcome = await checkUrl(entry.url, options)
      results[index] = { ...outcome, where: entry.where }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, entries.length)) }, worker)
  await Promise.all(workers)
  return results
}

export function summarise(results) {
  return {
    total: results.length,
    ok: results.filter((item) => item.result === 'ok').length,
    handCheck: results.filter((item) => item.result === 'hand-check').length,
    broken: results.filter((item) => item.result === 'broken').length,
  }
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    out: DEFAULT_OUT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--root' && value) options.root = resolve(value)
    else if (flag === '--out' && value) options.out = resolve(value)
    else if (flag === '--timeout' && value) options.timeoutMs = Number(value) || DEFAULT_TIMEOUT_MS
    else if (flag === '--concurrency' && value) options.concurrency = Number(value) || DEFAULT_CONCURRENCY
    else if (flag === '--help') return { help: true }
    if (flag.startsWith('--') && value && !value.startsWith('--')) index += 1
  }
  return options
}

function printHelp() {
  console.log(`check-links — fetch every resource URL and write a report

  node scripts/check-links.mjs [--root <dir>] [--out <file>] [--timeout <ms>] [--concurrency <n>]

  403, 429 and 999 are reported as "hand-check" (open them in a browser);
  everything else that is not 2xx is "broken".`)
}

async function runCli(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return 0
  }

  const entries = collectResourceUrls(options.root)
  if (entries.length === 0) {
    console.log(
      `check-links: no study-material resources in ${relative(process.cwd(), options.root) || options.root}`
    )
    return 0
  }

  console.log(`check-links: fetching ${entries.length} URL(s)…`)
  const results = await checkLinks(entries, options)
  const counts = summarise(results)

  const report = {
    generatedAt: new Date().toISOString(),
    root: relative(PROJECT_ROOT, options.root) || options.root,
    summary: counts,
    results,
  }
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  for (const item of results) {
    const label =
      item.result === 'ok' ? 'ok' : item.result === 'hand-check' ? 'hand-check' : 'BROKEN'
    const detail = item.status ?? item.error ?? ''
    console.log(`  [${label}] ${detail} ${item.url}${item.title ? ` — ${item.title}` : ''}`)
  }

  console.log(
    `\ncheck-links: ${counts.ok} ok, ${counts.handCheck} to check by hand, ${counts.broken} broken` +
      `\nreport written to ${relative(process.cwd(), options.out) || options.out}`
  )

  return counts.broken > 0 ? 1 : 0
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  // Set the exit code and let Node drain its sockets; calling process.exit()
  // here races with undici's still-closing handles on Windows.
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (err) => {
      console.error(`check-links: ${err?.message || err}`)
      process.exitCode = 1
    }
  )
}
