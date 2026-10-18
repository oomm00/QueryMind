/**
 * LevelControl — the one thing a student chooses before practising: how hard.
 *
 * A level is a Bloom band (see lib/buildSession.js), not the content's
 * difficulty field, and the course page remembers the choice so every Start
 * button asks the same kind of question next time.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { PRACTICE_LEVELS } from '../../lib/buildSession.js'

export function LevelControl({ value, onChange, label = 'Question level', className }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex items-center gap-1 rounded-control border border-line bg-surface-raised p-1',
        className
      )}
    >
      {PRACTICE_LEVELS.map((level) => {
        const active = value === level.value
        return (
          <button
            key={level.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(level.value)}
            className={cx(
              'rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink'
            )}
          >
            {level.label}
          </button>
        )
      })}
    </div>
  )
}

export default LevelControl
