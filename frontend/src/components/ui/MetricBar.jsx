/**
 * MetricBar — compact metric component for dashboards.
 * Flat fill, 1px border, no heavy shadows.
 *
 * Accepts either a `score` in 0..1 (renders a proportional bar) or a plain
 * `value` (renders text; a bar is only drawn for 0..1 numeric values).
 * `color` may be any CSS color (hex/rgb/var) and is applied inline.
 */

import React from 'react'

export function MetricBar({ label, title, subtitle, value, score, icon, color }) {
  const name = label ?? title ?? ''

  const numeric =
    typeof score === 'number'
      ? score
      : typeof value === 'number' && value >= 0 && value <= 1
        ? value
        : null

  const pct = numeric == null ? null : Math.max(0, Math.min(100, Math.round(numeric * 100)))
  const swatch = color || 'var(--moss)'

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--muted)]">
          {icon ? `${icon} ` : ''}
          {name}
        </span>
        <span className="text-sm font-medium text-[var(--ink)]">
          {value != null ? value : pct != null ? `${pct}%` : ''}
        </span>
      </div>

      {subtitle && (
        <span className="text-[11px] text-[var(--muted)] opacity-80">{subtitle}</span>
      )}

      {pct != null && (
        <div className="w-full h-1.5 rounded-md bg-[var(--line)] overflow-hidden mt-1">
          <div
            className="h-full rounded-md transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, background: swatch }}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={pct}
          />
        </div>
      )}
    </div>
  )
}
