/**
 * Bloom's Revised Taxonomy Constants
 * 6-level cognitive scale with teal hue ramp, no emoji in labels.
 */

export const BLOOM_COLORS = {
  remember:   '#CDEFEA',  // very light teal
  understand: '#9EDDD3',  // light teal
  apply:      '#6CC8BB',  // medium teal
  analyze:    '#3FAE9F',  // deep teal
  evaluate:   '#23867A',  // darker teal
  create:     '#136058',  // darkest teal
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
  return BLOOM_COLORS[level?.toLowerCase()] ?? '#6CC8BB'
}