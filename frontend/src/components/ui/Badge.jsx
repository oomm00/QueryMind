/**
 * Badge — small labelled status tag with soft tint tones.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const TONES = {
  neutral: 'bg-surface-raised text-muted border border-line',
  default: 'bg-surface-raised text-muted border border-line',
  primary: 'bg-primary-tint text-primary border border-transparent',
  accent: 'bg-primary-tint text-primary border border-transparent',
  success: 'bg-success-tint text-success border border-transparent',
  warning: 'bg-warning-tint text-warning border border-transparent',
  danger: 'bg-danger-tint text-danger border border-transparent',
  error: 'bg-danger-tint text-danger border border-transparent',
}

export function Badge({ label, children, variant = 'neutral', tone, className, ...rest }) {
  const key = tone || variant
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
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
