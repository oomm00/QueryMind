/**
 * generateForm — the rules behind the "Pick a topic" form on /practice.
 *
 * The form is deliberately not a pair of dropdowns. A student arrives knowing
 * the topic they want to be asked about, so the topic is free text, helped by
 * suggestions drawn from the material they have uploaded and from the concept
 * titles the content library already knows. Subject is not asked for at all: it
 * is looked up from the document the topic matched, and falls back to
 * "general" when nothing matched.
 *
 * Difficulty is a band of Bloom levels, the same bands practice sessions use
 * (see lib/buildSession.js), so "Medium" here means apply and analyze there:
 *
 *   Easy   remember + understand
 *   Medium apply + analyze
 *   Hard   evaluate + create
 *   Mixed  every level
 *
 * The chips under it start from that band and the student can move them.
 *
 * Nothing here talks to a screen or to the network: it is all pure, so the
 * matching rules can be checked without a browser.
 */

import { levelsFor } from './buildSession.js'

/** The four difficulties, in the order the segmented control shows them. */
export const GENERATE_DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'mixed', label: 'Mixed' },
]

/** The subject a topic falls back to when no uploaded document matched it. */
export const GENERAL_SUBJECT = 'general'

/**
 * How many questions one run asks for. The chips are the quick picks; the form
 * also takes any whole number up to the ten-question maximum.
 */
export const GENERATE_COUNT_CHOICES = [6, 10]

/** The run lengths the form accepts outside the quick picks. */
export const MIN_GENERATE_COUNT = 1
export const MAX_GENERATE_COUNT = 10

/**
 * A count brought inside the range a run can actually ask for. Returns null when
 * the value is not a number at all, so a caller can leave the field alone rather
 * than snapping it to 1 while it is being typed in.
 */
export function clampCount(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(MAX_GENERATE_COUNT, Math.max(MIN_GENERATE_COUNT, Math.round(number)))
}

/**
 * How many generation calls are allowed to be in flight at once. The backend
 * answers one question per call, so a run of ten is ten calls; two at a time
 * keeps the model busy without walking into a rate limit.
 */
export const MAX_IN_FLIGHT = 2

/** A single call is given this long before it is counted as lost. */
export const CALL_TIMEOUT_MS = 50_000

/** The Bloom levels a difficulty covers; the chips start from it. */
export function bloomsForDifficulty(difficulty) {
  return levelsFor(difficulty)
}

/** True when a value is one of the four difficulty keys. */
export function isGenerateDifficulty(value) {
  return GENERATE_DIFFICULTIES.some((option) => option.value === value)
}

/** The label a difficulty is shown under. */
export function difficultyLabel(value) {
  return GENERATE_DIFFICULTIES.find((option) => option.value === value)?.label ?? String(value ?? '')
}

// ── Turning a typed topic into an id ────────────────────────

/**
 * A typed topic as a slug: lowercase words joined by hyphens, nothing else.
 * Returns '' when there is nothing usable, so a caller can refuse rather than
 * mint a meaningless id.
 */
export function slugifyTopic(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The concept id a typed topic's mastery is filed under. Mastery is keyed by
 * (user, concept, bloom) and knows nothing about courses, so a topic the student
 * typed can be mastered exactly like an authored concept as long as its id is
 * stable: the slug of what they typed.
 */
export function customConceptId(topic) {
  const slug = slugifyTopic(topic)
  return slug ? `custom:${slug}` : null
}

// ── Matching what was typed against what exists ─────────────

/** A topic reduced to comparable words: lowercase, no punctuation. */
export function normaliseTopic(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The same word without a trailing plural "s", so Deadlock ~ Deadlocks. */
function withoutPlural(word) {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

function withoutPlurals(text) {
  return text.split(' ').map(withoutPlural).join(' ')
}

/** The number of single-character edits between two strings. */
export function editDistance(left, right) {
  const a = String(left ?? '')
  const b = String(right ?? '')
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

/** How far apart two typed topics are, after casing and plurals are set aside. */
export function topicDistance(typed, candidate) {
  return editDistance(withoutPlurals(normaliseTopic(typed)), withoutPlurals(normaliseTopic(candidate)))
}

/**
 * Whether two topics are close enough to offer one for the other. Case is
 * ignored, singular and plural are the same word, and anything within two
 * edits counts as a likely typo.
 */
export function isCloseTopic(typed, candidate) {
  const left = normaliseTopic(typed)
  const right = normaliseTopic(candidate)
  if (!left || !right) return false
  return withoutPlurals(left) === withoutPlurals(right) || editDistance(left, right) <= 2
}

/**
 * The closest candidate to what was typed, or null when nothing is close. The
 * nearest by edit distance wins, so "Deadlock" prefers "Deadlocks" to a word
 * that merely happens to be within two edits.
 */
export function findTopicSuggestion(typed, candidates = []) {
  const matches = (candidates ?? []).filter((candidate) => isCloseTopic(typed, candidate))
  if (matches.length === 0) return null

  return matches
    .map((candidate) => ({ candidate, distance: topicDistance(typed, candidate) }))
    .sort((a, b) => a.distance - b.distance || String(a.candidate).localeCompare(String(b.candidate)))[0]
    .candidate
}

/**
 * The subject a typed topic belongs to. An uploaded document's topic is matched
 * the same fuzzy way the suggestion is, and when nothing matches the question
 * is asked under "general".
 *
 * @param {string} typed
 * @param {Array<{subject: string, topics: string[]}>} rows - GET /documents/topics
 */
export function subjectForTopic(typed, rows = []) {
  const wanted = normaliseTopic(typed)
  if (!wanted) return GENERAL_SUBJECT

  let exact = null
  let loose = null
  for (const row of rows ?? []) {
    for (const topic of row?.topics ?? []) {
      if (normaliseTopic(topic) === wanted) {
        if (!exact) exact = row.subject
      } else if (!loose && isCloseTopic(typed, topic)) {
        loose = row.subject
      }
    }
  }
  return exact ?? loose ?? GENERAL_SUBJECT
}

/**
 * Every topic worth suggesting as the student types: the topics their own
 * documents cover first, then the concept titles the content library knows.
 * Duplicates are dropped case-insensitively, and the order is stable.
 */
export function topicSuggestions({ documentTopics = [], conceptTitles = [] } = {}) {
  const seen = new Set()
  const out = []
  for (const value of [...documentTopics, ...conceptTitles]) {
    const label = String(value ?? '').trim()
    if (!label) continue
    const key = normaliseTopic(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

/** The suggestions that start with what has been typed, best match first. */
export function matchingSuggestions(typed, candidates = [], limit = 6) {
  const wanted = normaliseTopic(typed)
  if (!wanted) return (candidates ?? []).slice(0, limit)

  return (candidates ?? [])
    .filter((candidate) => normaliseTopic(candidate).includes(wanted))
    .sort((a, b) => {
      const aStarts = normaliseTopic(a).startsWith(wanted) ? 0 : 1
      const bStarts = normaliseTopic(b).startsWith(wanted) ? 0 : 1
      return aStarts - bStarts || String(a).localeCompare(String(b))
    })
    .slice(0, limit)
}
