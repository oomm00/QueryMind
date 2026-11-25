/**
 * Badge — small labelled status tag with soft tint tones.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const TONES = {
  neutral: 'bg-surface-raised text-muted border border-line',
  default: 'bg-surface-raised text-muted border border-line',
  primary: 'bg-primary/10 text-primary border border-primary/20',
  accent: 'bg-primary/10 text-primary border border-primary/20',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  danger: 'bg-danger/10 text-danger border border-danger/20',
  error: 'bg-danger/10 text-danger border border-danger/20',
}

export function Badge({ label, children, variant = 'neutral', tone, className, ...rest }) {
  const key = tone || variant
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        TONES[key] || TONES.neutral,
        className
      )}
      {...rest}
    >
      {label ?? children}
    </span>
  )
}

export default Badge
