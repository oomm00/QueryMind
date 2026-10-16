/**
 * ProgressRing — indeterminate loading spinner.
 */

import React from 'react'

export function ProgressRing({ className, size = 20, ...rest }) {
  return (
    <svg
      className={`size-${size} ${className || ''}`}
      viewBox="0 0 24 24"
      aria-label="Loading"
      {...rest}
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          dur="1.4s"
          values="0 12 12;360 12 12"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}

export default ProgressRing
