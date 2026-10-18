/**
 * Chip — compact selectable / removable tag.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { IconClose } from './Icons'

const VARIANTS = {
  default: 'bg-surface border border-line text-muted hover:text-ink hover:bg-surface-raised',
  active: 'bg-primary text-primary-fg border border-transparent',
}

export function Chip({ label, children, variant = 'default', onRemove, className, ...rest }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150',
        VARIANTS[variant] || VARIANTS.default,
        className
      )}
      {...rest}
    >
      <span>{label ?? children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <IconClose size={12} />
        </button>
      )}
    </span>
  )
}

export default Chip
