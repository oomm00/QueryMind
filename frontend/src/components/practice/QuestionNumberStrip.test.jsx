/**
 * QuestionNumberStrip — the map of a session.
 *
 * Every question is one click away, the first and the last included, and each
 * number says its state in words so the strip does not depend on colour.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionNumberStrip } from './QuestionNumberStrip.jsx'

const questions = [1, 2, 3, 4].map((n) => ({ question_id: `q${n}`, type: 'mcq' }))

describe('QuestionNumberStrip', () => {
  it('jumps to any question, the first and the last included', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()
    render(<QuestionNumberStrip questions={questions} currentIndex={0} onJump={onJump} />)

    await user.click(screen.getByRole('button', { name: 'Question 4, unanswered' }))
    expect(onJump).toHaveBeenLastCalledWith(3)

    await user.click(screen.getByRole('button', { name: 'Question 1, unanswered, current' }))
    expect(onJump).toHaveBeenLastCalledWith(0)
  })

  it('says each question state in words', () => {
    render(
      <QuestionNumberStrip
        questions={questions}
        answers={{ q2: { selected: 0 } }}
        flagged={['q3']}
        currentIndex={1}
      />
    )

    expect(screen.getByRole('button', { name: 'Question 2, answered, current' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Question 3, unanswered, flagged' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 4, unanswered' })).toBeInTheDocument()
  })

  it('counts a written answer that has words in it, and not one that is blank', () => {
    render(
      <QuestionNumberStrip
        questions={[
          { question_id: 's1', type: 'short' },
          { question_id: 's2', type: 'short' },
        ]}
        answers={{ s1: { text: 'something' }, s2: { text: '   ' } }}
        currentIndex={0}
      />
    )

    expect(screen.getByRole('button', { name: 'Question 1, answered, current' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 2, unanswered' })).toBeInTheDocument()
  })
})
