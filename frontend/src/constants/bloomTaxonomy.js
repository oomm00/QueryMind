/**
 * Bloom's Revised Taxonomy Constants
 * 6-level cognitive scale. Labels carry no emoji.
 *
 * BLOOM_COLORS is a single mid-teal ramp: every step sits in the teal 400-700
 * band, so no level drops out against the light surface (#ffffff) or the dark
 * surface (#1c1f24). These values are used as accent fills and dots, not body
 * text, so the ramp does not need text-level contrast.
 */

export const BLOOM_COLORS = {
  remember:   '#2DD4BF', // teal 400
  understand: '#14B8A6', // teal 500
  apply:      '#0FA79C', // teal 500-600
  analyze:    '#0D9488', // teal 600
  evaluate:   '#0E8578', // teal 600-700
  create:     '#0F766E', // teal 700
}

export const BLOOM_LEVELS = [
  {
    value: 'remember',
    label: 'Remember',
    desc: 'Recall facts & basic concepts',
    color: BLOOM_COLORS.remember,
  },
  {
    value: 'understand',
    label: 'Understand',
    desc: 'Explain ideas or concepts',
    color: BLOOM_COLORS.understand,
  },
  {
    value: 'apply',
    label: 'Apply',
    desc: 'Use information in new situations',
    color: BLOOM_COLORS.apply,
  },
  {
    value: 'analyze',
    label: 'Analyze',
    desc: 'Draw connections among ideas',
    color: BLOOM_COLORS.analyze,
  },
  {
    value: 'evaluate',
    label: 'Evaluate',
    desc: 'Justify a stand or decision',
    color: BLOOM_COLORS.evaluate,
  },
  {
    value: 'create',
    label: 'Create',
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
  return BLOOM_COLORS[level?.toLowerCase()] ?? '#14B8A6'
}
