/**
 * Tooltip — CSS-only label on hover / keyboard focus. Keep labels short.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const SIDES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

export function Tooltip({ label, side = 'top', children, className }) {
  return (
    <span className={cx('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-pop',
          'transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          SIDES[side] || SIDES.top
        )}
      >
        {label}
      </span>
    </span>
  )
}

export default Tooltip
