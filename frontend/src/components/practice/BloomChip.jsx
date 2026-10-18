/**
 * BloomChip — the one badge that says which kind of thinking a question asks
 * for, and how far up the taxonomy that is.
 *
 * The level's colour is used as a dot rather than as the text colour, so the
 * label stays readable in both themes and for anyone who cannot tell the teal
 * ramp apart. The level is also written in words next to the dot ("Remember
 * L1"), so nothing depends on colour alone.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { BLOOM_LEVELS } from '../../constants/bloomTaxonomy.js'
import { sentenceCase } from '../../lib/text'

/** The label, taxonomy position and colour of a Bloom level. */
export function bloomMeta(bloom) {
  const index = BLOOM_LEVELS.findIndex((level) => level.value === bloom)
  const level = index >= 0 ? BLOOM_LEVELS[index] : null
  return {
    label: level?.label ?? sentenceCase(bloom ?? ''),
    description: level?.desc ?? '',
    level: index >= 0 ? index + 1 : null,
    color: level?.color ?? '#14B8A6',
  }
}

/** "Remember L1", for screen readers and titles. */
export function bloomLabel(bloom) {
  const meta = bloomMeta(bloom)
  return meta.level ? `${meta.label} L${meta.level}` : meta.label
}

export function BloomChip({ bloom, showLevel = true, className }) {
  const meta = bloomMeta(bloom)

  return (
    <span
      title={meta.description || undefined}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
      {showLevel && meta.level ? <span className="text-muted">L{meta.level}</span> : null}
    </span>
  )
}

export default BloomChip
