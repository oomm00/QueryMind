/**
 * Textarea — multi-line text field. `mono` renders code with JetBrains Mono.
 */

import React from 'react'
import { cx } from '../../lib/cx'

function fieldId(id, label) {
  if (id) return id
  if (label) return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return undefined
}

export function Textarea({ label, hint, error, id, className, rows = 4, mono = false, ...rest }) {
  const areaId = fieldId(id, label)
  const area = (
    <textarea
      id={areaId}
      rows={rows}
      aria-invalid={error ? 'true' : undefined}
      className={cx(
        'w-full px-3 py-2.5 rounded-control border bg-surface text-ink text-sm resize-y',
        'placeholder:text-muted transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        mono && 'font-mono text-[13px]',
        error ? 'border-danger' : 'border-line',
        className
      )}
      {...rest}
    />
  )

  if (!label && !hint && !error) return area

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={areaId} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {area}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Textarea
