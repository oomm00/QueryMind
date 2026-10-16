/**
 * Skeleton — shimmer loading placeholder.
 */

import React from 'react'

export function Skeleton({ className, ...rest }) {
  return (
    <div className={`skeleton ${className || ''}`} {...rest} />
  )
}

export default Skeleton
