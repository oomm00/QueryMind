/**
 * MetricBar — compact label + value + proportional bar for dashboards.
 * Accepts a `score` in 0..1 or a plain `value`; a bar is only drawn when a
 * 0..1 numeric score/value is supplied.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const TONES = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

export function MetricBar({ label, title, subtitle, value, score, icon, color, tone = 'primary', className }) {
  const name = label ?? title ?? ''

  const numeric =
    typeof score === 'number'
      ? score
      : typeof value === 'number' && value >= 0 && value <= 1
        ? value
        : null

  const pct = numeric == null ? null : Math.max(0, Math.min(100, Math.round(numeric * 100)))
  const swatch = color || TONES[tone] || TONES.primary

  return (
    <div className={cx('py-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          {icon}
          {name}
        </span>
        <span className="text-sm font-medium tabular-nums text-ink">
          {value != null ? value : pct != null ? `${pct}%` : ''}
        </span>
      </div>

      {subtitle && <span className="text-[11px] text-muted">{subtitle}</span>}

      {pct != null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, background: swatch }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

export default MetricBar
