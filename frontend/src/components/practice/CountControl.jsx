/**
 * CountControl — how many questions a practice board session asks.
 *
 * The same segmented shape as LevelControl, and the same choices everywhere, so
 * a student picks a length without opening a menu.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { SESSION_COUNT_CHOICES } from '../../lib/buildSession.js'

export function CountControl({ value, onChange, label = 'Number of questions', className }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex items-center gap-1 rounded-control border border-line bg-surface-raised p-1',
        className
      )}
    >
      {SESSION_COUNT_CHOICES.map((count) => {
        const active = value === count
        return (
          <button
            key={count}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(count)}
            className={cx(
              'rounded-[6px] px-3 py-1.5 text-[13px] font-medium tabular-nums transition-colors duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink'
            )}
          >
            {count}
          </button>
        )
      })}
    </div>
  )
}

export default CountControl
