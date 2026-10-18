/**
 * text — display formatting for content names.
 */

// Everyday computing acronyms. Content is authored in title case ("Cpu
// Scheduling"), so these arrive capitalised but not upper-case; casing them
// back to "CPU" is the exception to the sentence-case rule rather than a
// separate rule of its own.
const ACRONYMS = new Set([
  'api',
  'cpu',
  'db',
  'dns',
  'fifo',
  'gpu',
  'gui',
  'http',
  'https',
  'i/o',
  'io',
  'ip',
  'lru',
  'mmu',
  'os',
  'pcb',
  'ram',
  'rom',
  'sql',
  'ssd',
  'tcp',
  'tlb',
  'udp',
  'ui',
  'url',
  'ux',
])

/**
 * sentenceCase('Address Translation') -> 'Address translation'
 * sentenceCase('CPU Scheduling')        -> 'CPU scheduling'
 *
 * Only the first word is capitalised and acronyms are preserved, so a name
 * like "TLB and the page table" survives intact.
 */
export function sentenceCase(value) {
  const text = String(value ?? '').trim()
  if (!text) return text

  return text
    .split(/\s+/)
    .map((word, index) => {
      const bare = word.replace(/[^\w/]/g, '').toLowerCase()
      if (ACRONYMS.has(bare)) return word.toUpperCase()
      const lower = word.toLowerCase()
      if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1)
      return lower
    })
    .join(' ')
}

/**
 * formatWhen('2026-10-18T09:12:00.000Z') -> 'Oct 18, 9:12 AM'
 *
 * A stored timestamp in the reader's own locale, or null when there is nothing
 * usable to show. Callers decide what to say when it is null.
 */
export function formatWhen(iso) {
  if (!iso) return null
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

