/**
 * Badge — small labeled tag.
 */

import React from 'react'

export function Badge({ label, variant = 'default', className, ...rest }) {
  const variantClasses = {
    default: 'bg-surface/50 text-muted border border-line',
    accent: 'bg-moss text-white',
  }

  return (
    <span className={`badge ${variantClasses[variant] || ''} ${className || ''}`} {...rest}>
      {label}
    </span>
  )
}

export default Badge
