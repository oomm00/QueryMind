/**
 * StatCard — headline metric with an optional tinted icon.
 * `icon` may be an icon component (from Icons.jsx) or a rendered node.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { Panel } from './Panel'

const TONES = {
  primary: 'bg-primary-tint text-primary',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-surface-raised text-muted',
}

export function StatCard({ label, value, hint, icon, tone = 'primary', className, ...rest }) {
  return (
    <Panel className={cx('flex items-start gap-3 p-4', className)} {...rest}>
      {icon && (
        <span
          className={cx(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
            TONES[tone] || TONES.primary
          )}
        >
          {typeof icon === 'function' ? React.createElement(icon, { size: 18 }) : icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </Panel>
  )
}

export default StatCard
