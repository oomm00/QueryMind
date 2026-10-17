/**
 * ProgressLine — determinate horizontal progress bar.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

function clamp(n) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

export function ProgressLine({
  percentage = 0,
  tone = 'primary',
  showLabel = false,
  label,
  className,
  trackClassName,
  ...rest
}) {
  const pct = clamp(percentage)

  return (
    <div className={cx('flex items-center gap-2', className)} {...rest}>
      <div
        className={cx('h-2 w-full overflow-hidden rounded-full bg-line', trackClassName)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            TONES[tone] || TONES.primary
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
          {label ?? `${pct}%`}
        </span>
      )}
    </div>
  )
}

export default ProgressLine
