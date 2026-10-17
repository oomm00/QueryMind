/**
 * ProgressRing — determinate circular progress (or an indeterminate spinner
 * when `indeterminate` is set).
 */

import React from 'react'
import { cx } from '../../lib/cx'

const TONES = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function clamp(n) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

export function ProgressRing({
  value = 0,
  size = 48,
  stroke = 4,
  tone = 'primary',
  indeterminate = false,
  label,
  showValue = true,
  className,
  ...rest
}) {
  const pct = clamp(value)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = indeterminate ? circumference * 0.3 : circumference * (pct / 100)
  const gap = circumference - dash

  return (
    <div
      className={cx('relative inline-flex items-center justify-center', className)}
      {...rest}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cx(TONES[tone] || TONES.primary, indeterminate && 'animate-spin')}
        role="img"
        aria-label={label || (indeterminate ? 'Loading' : `${pct}% complete`)}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={indeterminate ? undefined : 'transition-[stroke-dasharray] duration-500 ease-out'}
        />
      </svg>
      {!indeterminate && showValue && (
        <span
          className="absolute font-semibold tabular-nums text-ink"
          style={{ fontSize: Math.max(10, Math.round(size * 0.24)) }}
        >
          {label ?? `${pct}%`}
        </span>
      )}
    </div>
  )
}

export default ProgressRing
