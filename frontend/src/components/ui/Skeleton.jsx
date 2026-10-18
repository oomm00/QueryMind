/**
 * Skeleton — shimmering loading placeholder.
 */

import React from 'react'
import { cx } from '../../lib/cx'

export function Skeleton({ className, circle = false, ...rest }) {
  return (
    <div
      className={cx('animate-shimmer rounded-control', circle && 'rounded-full', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, var(--line) 25%, var(--surface-2) 37%, var(--line) 63%)',
        backgroundSize: '400% 100%',
      }}
      aria-hidden="true"
      {...rest}
    />
  )
}

export default Skeleton
