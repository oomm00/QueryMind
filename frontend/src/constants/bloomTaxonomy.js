/**
 * Bloom's Revised Taxonomy Constants
 * 6-level cognitive scale from cool to warm:
 * remember -> understand -> apply -> analyze -> evaluate -> create
 */

export const BLOOM_COLORS = {
  remember:   '#38bdf8', // Sky 400 (Cool)
  understand: '#14b8a6', // Teal 500
  apply:      '#22c55e', // Green 500
  analyze:    '#eab308', // Yellow 500
  evaluate:   '#f97316', // Orange 500
  create:     '#f43f5e', // Rose 500 (Warm)
}

export const BLOOM_LEVELS = [
  {
    value: 'remember',
    label: 'Remember',
    emoji: '📌',
    desc: 'Recall facts & basic concepts',
    color: BLOOM_COLORS.remember,
  },
  {
    value: 'understand',
    label: 'Understand',
    emoji: '💡',
    desc: 'Explain ideas or concepts',
    color: BLOOM_COLORS.understand,
  },
  {
    value: 'apply',
    label: 'Apply',
    emoji: '🔧',
    desc: 'Use information in new situations',
    color: BLOOM_COLORS.apply,
  },
  {
    value: 'analyze',
    label: 'Analyze',
    emoji: '🔍',
    desc: 'Draw connections among ideas',
    color: BLOOM_COLORS.analyze,
  },
  {
    value: 'evaluate',
    label: 'Evaluate',
    emoji: '⚖️',
    desc: 'Justify a stand or decision',
    color: BLOOM_COLORS.evaluate,
  },
  {
    value: 'create',
    label: 'Create',
    emoji: '✨',
    desc: 'Produce new or original work',
    color: BLOOM_COLORS.create,
  },
]

export const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export function getBloomColor(level) {
  return BLOOM_COLORS[level?.toLowerCase()] ?? '#a1a1aa'
}
