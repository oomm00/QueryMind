/**
 * Select — native dropdown with a custom chevron. Accepts either <option>
 * children or an `options` array of strings / { value, label } objects.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { IconChevronDown } from './Icons'

function fieldId(id, label) {
  if (id) return id
  if (label) return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return undefined
}

function renderOptions(options) {
  if (!options) return null
  return options.map((opt) => {
    const value = typeof opt === 'object' ? opt.value : opt
    const label = typeof opt === 'object' ? opt.label : opt
    return (
      <option key={value} value={value}>
        {label}
      </option>
    )
  })
}

export function Select({ label, hint, error, id, className, children, options, ...rest }) {
  const selectId = fieldId(id, label)
  const select = (
    <div className="relative">
      <select
        id={selectId}
        aria-invalid={error ? 'true' : undefined}
        className={cx(
          'w-full h-10 pl-3 pr-9 rounded-control border bg-surface text-ink text-sm appearance-none',
          'transition-colors duration-150 cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          error ? 'border-danger' : 'border-line',
          className
        )}
        {...rest}
      >
        {children}
        {renderOptions(options)}
      </select>
      <IconChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  )

  if (!label && !hint && !error) return select

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {select}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Select
