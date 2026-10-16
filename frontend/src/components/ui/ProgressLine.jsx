/**
 * ProgressLine — determinate progress fill.
 */

import React from 'react'

export function ProgressLine({ percentage = 0, className, ...rest }) {
  const pct = Math.max(0, Math.min(100, percentage))

  return (
    <div className="progress-line">
      <div
        className={`progress-line-fill ${pct > 0 ? 'w-full' : 'w-0'}`}
        style={{ width: `${pct}%` }}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
      />
    </div>
  )
}