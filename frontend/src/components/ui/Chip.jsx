/**
 * Chip — compact removable tag.
 */

import React from 'react'

export function Chip({ label, variant = 'default', onRemove, ...rest }) {
  const variantClasses = {
    default: 'bg-surface/50 text-muted hover:bg-moss/20 hover:text-moss',
    active: 'bg-moss text-white',
  }

  return (
    <div
      className={`chip ${variantClasses[variant]}`}
      {...rest}
    >
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          className="chip-remove"
          onClick={onRemove}
          aria-label="Remove chip"
        >
          ✕
        </button>
      )}
    </div>
  )
}