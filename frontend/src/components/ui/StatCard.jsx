/**
 * StatCard — headline metric with an optional tinted icon.
 * `icon` may be an icon component (from Icons.jsx) or a rendered node.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { Panel } from './Panel'

const TONES = {
  primary: 'bg-primary/10 text-primary border border-primary/20',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  danger: 'bg-danger/10 text-danger border border-danger/20',
  neutral: 'bg-surface-raised text-muted border border-line',
}

export function StatCard({ label, value, hint, icon, tone = 'primary', className, ...rest }) {
  return (
    <Panel className={cx('flex items-start gap-3.5 p-4 md:p-5 hover:border-line-strong transition-all duration-200', className)} {...rest}>
      {icon && (
        <span
          className={cx(
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner',
            TONES[tone] || TONES.primary
          )}
        >
          {typeof icon === 'function' ? React.createElement(icon, { size: 20 }) : icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted/80">{hint}</p>}
      </div>
    </Panel>
  )
}

export default StatCard
