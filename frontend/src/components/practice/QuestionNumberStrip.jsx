/**
 * QuestionNumberStrip — the row of question numbers under the session header.
 *
 * It is a map of the session: which questions are answered, which are flagged and
 * where the student is. Every number is a button, so any question is one click
 * away, first and last included - there is no need to page through to reach the
 * end. Each button carries its state in words for a screen reader
 * ("Question 3, answered, flagged"), so the strip never relies on colour alone.
 */

import React from 'react'
import { cx } from '../../lib/cx'

function stateLabel({ answered, flagged, current }) {
  const parts = [answered ? 'answered' : 'unanswered']
  if (flagged) parts.push('flagged')
  if (current) parts.push('current')
  return parts.join(', ')
}

export function QuestionNumberStrip({ questions, answers = {}, flagged = [], currentIndex = 0, onJump, className }) {
  const flaggedSet = new Set(flagged)

  return (
    <ol className={cx('flex flex-wrap items-center gap-1.5', className)} aria-label="Questions in this session">
      {questions.map((question, index) => {
        const answered = question.type === 'mcq'
          ? Number.isInteger(answers?.[question.question_id]?.selected)
          : Boolean(String(answers?.[question.question_id]?.text ?? '').trim())
        const isFlagged = flaggedSet.has(question.question_id)
        const isCurrent = index === currentIndex

        return (
          <li key={question.question_id}>
            <button
              type="button"
              onClick={() => onJump?.(index)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Question ${index + 1}, ${stateLabel({ answered, flagged: isFlagged, current: isCurrent })}`}
              className={cx(
                'relative inline-flex h-9 w-9 items-center justify-center rounded-control border text-[13px] font-medium tabular-nums transition-colors duration-150',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                isCurrent
                  ? 'border-primary bg-primary-tint text-primary'
                  : answered
                    ? 'border-transparent bg-success-tint text-success hover:brightness-105'
                    : 'border-line bg-surface text-muted hover:text-ink'
              )}
            >
              {index + 1}
              {isFlagged && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-surface bg-warning"
                />
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export default QuestionNumberStrip
