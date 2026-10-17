/**
 * conceptStatus — one vocabulary for how a concept is going.
 *
 * Status is derived only from what the lessonProgress store can measure: the
 * share of check answers in the concept's lessons that were correct. A concept
 * whose lessons have no answered checks has no estimate at all and says
 * "No mastery estimate" rather than inventing a number.
 *
 * Every status carries an icon, a label and a tone, and the icon is never the
 * only signal: callers render the label next to it, so status never depends on
 * colour alone.
 */

import {
  IconAlert,
  IconCheck,
  IconInfo,
  IconLearning,
  IconTarget,
  IconWeakAreas,
} from '../ui/Icons'

export const NOT_STARTED = 'not-started'

/** Reading order for the legend and the status filter. */
export const STATUS_ORDER = [
  'demonstrated',
  'learning',
  'developing',
  'needs-revision',
  'needs-support',
  NOT_STARTED,
]

const STATUSES = {
  demonstrated: {
    id: 'demonstrated',
    label: 'Demonstrated',
    icon: IconCheck,
    tone: 'success',
  },
  learning: { id: 'learning', label: 'Learning', icon: IconLearning, tone: 'primary' },
  developing: { id: 'developing', label: 'Developing', icon: IconTarget, tone: 'primary' },
  'needs-revision': {
    id: 'needs-revision',
    label: 'Needs revision',
    icon: IconAlert,
    tone: 'warning',
  },
  'needs-support': {
    id: 'needs-support',
    label: 'Needs support',
    icon: IconWeakAreas,
    tone: 'danger',
  },
  [NOT_STARTED]: {
    id: NOT_STARTED,
    label: 'Not started',
    icon: IconInfo,
    tone: 'neutral',
  },
}

export const STATUS_LIST = STATUS_ORDER.map((id) => STATUSES[id])

export function statusById(id) {
  return STATUSES[id] ?? STATUSES[NOT_STARTED]
}

/**
 * Where the bands sit. High to low, first match wins; these are the only
 * judgement call in the status model, kept in one place so they are easy to
 * re-tune. Below 20% a concept needs support, not just revision.
 */
const BANDS = [
  [0.85, 'demonstrated'],
  [0.6, 'learning'],
  [0.4, 'developing'],
  [0.2, 'needs-revision'],
  [0, 'needs-support'],
]

/** @param {number|null} mastery share of checks answered correctly, or null */
export function statusFor(mastery) {
  if (mastery == null || Number.isNaN(mastery)) return STATUSES[NOT_STARTED]
  const band = BANDS.find(([floor]) => mastery >= floor)
  return STATUSES[band ? band[1] : 'needs-support']
}

/** "62% estimated mastery", or the sentence used when nothing is measured. */
export function masteryLabel(mastery) {
  if (mastery == null || Number.isNaN(mastery)) return 'No mastery estimate'
  return `${Math.round(mastery * 100)}% estimated mastery`
}

/** "Learning · 62% estimated mastery", or "No mastery estimate". */
export function statusLine(mastery) {
  const status = statusFor(mastery)
  if (mastery == null || Number.isNaN(mastery)) return 'No mastery estimate'
  return `${status.label} · ${masteryLabel(mastery)}`
}

const TONE_CLASS = {
  success: 'text-success',
  primary: 'text-primary',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
}

export function toneClass(tone) {
  return TONE_CLASS[tone] ?? TONE_CLASS.neutral
}

const TONE_BADGE = {
  success: 'success',
  primary: 'primary',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
}

/** The Badge tone that matches a status tone. */
export function badgeTone(tone) {
  return TONE_BADGE[tone] ?? 'neutral'
}
