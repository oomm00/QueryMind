/**
 * Input — single-line text field. Optionally renders a label, hint and error.
 */

import React from 'react'
import { cx } from '../../lib/cx'

function fieldId(id, label) {
  if (id) return id
  if (label) return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return undefined
}

export function Input({ label, hint, error, id, className, ...rest }) {
  const inputId = fieldId(id, label)
  const input = (
    <input
      id={inputId}
      aria-invalid={error ? 'true' : undefined}
      className={cx(
        'w-full h-10 px-3 rounded-control border bg-surface text-ink text-sm',
        'placeholder:text-muted transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        error ? 'border-danger' : 'border-line',
        className
      )}
      {...rest}
    />
  )

  if (!label && !hint && !error) return input

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {input}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Input
