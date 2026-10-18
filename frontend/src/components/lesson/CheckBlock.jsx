/**
 * CheckBlock — "Check your understanding".
 *
 * Radio options, a "Check answer" action, then the verdict and the explanation.
 * The result is kept in the lessonProgress store so the reader can show it again
 * when the lesson is re-opened. It does not move mastery: mastery comes from the
 * scored answers of a practice session (lib/mastery.js), so the same check
 * answered here and later in a session is never counted twice.
 */

import React, { useState } from 'react'
import { cx } from '../../lib/cx'
import { Button } from '../ui/Button'
import { IconCheck, IconClose } from '../ui/Icons'
import { getCheckResult, recordCheck } from '../../content/lessonProgress.js'

export function CheckBlock({ block, lessonId, blockIndex }) {
  const { question, options = [], correctIndex, explanation } = block
  const stored = getCheckResult(lessonId, blockIndex)

  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState(stored !== null)

  // When the answer was given earlier in this session we only know whether it
  // was right, not which option was picked — so fall back to the stored verdict.
  const verdict = checked ? (selected == null ? stored : selected === correctIndex) : null
  const answer = options[correctIndex]

  const handleCheck = () => {
    if (selected == null || checked) return
    recordCheck(lessonId, blockIndex, selected === correctIndex)
    setChecked(true)
  }

  return (
    <section
      aria-label="Check your understanding"
      className="rounded-panel border border-line bg-surface-raised p-4"
    >
      <p className="text-sm font-semibold text-ink">Check your understanding</p>
      <p className="mt-2 text-[15px] font-medium text-ink">{question}</p>

      <div role="radiogroup" aria-label={question} className="mt-3 space-y-2">
        {options.map((option, index) => {
          const isSelected = selected === index
          const isAnswer = checked && index === correctIndex
          const isWrongPick = checked && isSelected && index !== correctIndex
          const fades = checked && !isAnswer && !isWrongPick

          return (
            <label
              key={option}
              className={cx(
                'flex cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2 text-sm transition-colors duration-150',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
                isAnswer && 'border-success bg-success-tint text-ink',
                isWrongPick && 'border-danger bg-danger-tint text-ink',
                !checked && isSelected && 'border-primary bg-primary-tint text-ink',
                !checked && !isSelected && 'border-line bg-surface text-ink hover:border-line-strong',
                fades && 'border-line bg-surface text-muted',
                checked && 'cursor-default'
              )}
            >
              <input
                type="radio"
                name={`check-${lessonId}-${blockIndex}`}
                value={index}
                checked={isSelected}
                disabled={checked}
                onChange={() => setSelected(index)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cx(
                  'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  isSelected || isAnswer ? 'border-current' : 'border-line-strong'
                )}
              >
                {(isSelected || isAnswer) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span>{option}</span>
            </label>
          )
        })}
      </div>

      {!checked && (
        <Button className="mt-4" size="sm" onClick={handleCheck} disabled={selected == null}>
          Check answer
        </Button>
      )}

      {checked && (
        <div role="status" aria-live="polite" className="mt-4">
          <p
            className={cx(
              'inline-flex items-center gap-1.5 text-sm font-semibold',
              verdict ? 'text-success' : 'text-danger'
            )}
          >
            {verdict ? <IconCheck size={16} /> : <IconClose size={16} />}
            {verdict ? 'Correct' : `Not quite — the answer is ${answer ?? 'shown above'}`}
          </p>
          {explanation && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{explanation}</p>
          )}
        </div>
      )}
    </section>
  )
}

export default CheckBlock
