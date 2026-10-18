/**
 * The practice loop, through the pages a student actually uses: an mcq is graded
 * the moment it is answered, a short answer is self-marked against the authored
 * rubric, and each of those moves mastery exactly once.
 *
 * The session is seeded the way the SessionProvider keeps it, so the pages are
 * rendered with real session state rather than a mocked context.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { concept, mcqQuestion, session, shortQuestion } from '../__fixtures__/content.js'
import { AuthProvider } from '../context/AuthContext.jsx'
import { SessionProvider } from '../context/SessionContext.jsx'
import { toSessionQuestion } from '../content/questionBank.js'
import FeedbackPage from './FeedbackPage.jsx'
import QuestionPage from './QuestionPage.jsx'

const USER = 'test-user'

function seedSession(questions, extra = {}) {
  window.localStorage.setItem('qm_user_id', USER)
  window.sessionStorage.setItem('qm_study_session', JSON.stringify(session(questions, extra)))
}

function renderPractice(entry = '/practice/session') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <SessionProvider>
          <Routes>
            <Route path="/practice/session" element={<QuestionPage />} />
            <Route path="/practice/feedback" element={<FeedbackPage />} />
            <Route path="/practice/new" element={<p>Practice setup</p>} />
            <Route path="/dashboard" element={<p>Dashboard</p>} />
          </Routes>
        </SessionProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

function storedMastery() {
  return JSON.parse(window.localStorage.getItem(`qm_progress_${USER}`) || 'null')
}

const mcq = () => toSessionQuestion(mcqQuestion, concept, 'concept')
const short = () => toSessionQuestion(shortQuestion, concept, 'concept')

describe('an mcq', () => {
  it('is graded here, and moves mastery once', async () => {
    const user = userEvent.setup()
    seedSession([mcq()])
    renderPractice()

    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument()
    expect(screen.getByText('Course bank')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '21,384' }))
    await user.click(screen.getByRole('button', { name: /Check answer/ }))

    expect(await screen.findByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('You chose the right option.')).toBeInTheDocument()
    expect(screen.getByText(mcqQuestion.explanation)).toBeInTheDocument()

    expect(storedMastery().concepts['fixture-concept'].understand).toMatchObject({
      value: 1,
      count: 1,
    })
  })

  it('says which option was right when the answer was wrong', async () => {
    const user = userEvent.setup()
    seedSession([mcq()])
    renderPractice()

    await user.click(screen.getByRole('radio', { name: '13,192' }))
    await user.click(screen.getByRole('button', { name: /Check answer/ }))

    expect(await screen.findByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByText('The right option was “21,384”.')).toBeInTheDocument()
    expect(storedMastery().concepts['fixture-concept'].understand).toMatchObject({
      value: 0,
      count: 1,
    })
  })

  it('is not reported on when it was never answered', () => {
    seedSession([mcq()])
    renderPractice('/practice/feedback')

    expect(screen.getByText('This question has not been answered')).toBeInTheDocument()
  })
})

describe('a short answer', () => {
  it('is self-marked against the authored rubric, and only the first mark counts', async () => {
    const user = userEvent.setup()
    seedSession([short()], { userAnswer: 'I would split the address into three fields.' })
    renderPractice('/practice/feedback')

    expect(screen.getByText('Not marked yet')).toBeInTheDocument()
    expect(screen.getByText(shortQuestion.answerKey)).toBeInTheDocument()
    expect(screen.getByText(shortQuestion.rubric[0].criterion)).toBeInTheDocument()

    const criteria = screen.getAllByRole('checkbox')
    expect(criteria).toHaveLength(3)

    await user.click(criteria[0])
    await user.click(criteria[1])
    expect(screen.getByText(/Mark: 3 of 4 points \(75%\)/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save my mark' }))

    expect(screen.getByText('Self-marked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update my mark' })).toBeInTheDocument()
    expect(storedMastery().concepts['fixture-concept'].apply).toMatchObject({
      value: 0.75,
      count: 1,
    })

    // Changing the mark replaces the result; it is not new evidence.
    await user.click(criteria[2])
    await user.click(screen.getByRole('button', { name: 'Update my mark' }))

    expect(screen.getByText(/Mark: 4 of 4 points \(100%\)/)).toBeInTheDocument()
    expect(storedMastery().concepts['fixture-concept'].apply).toMatchObject({
      value: 0.75,
      count: 1,
    })
  })

  it('says what is scored and what is not, before anything is marked', () => {
    seedSession([short()], { userAnswer: 'An answer I wrote myself.' })
    renderPractice('/practice/feedback')

    expect(
      screen.getByText(/Self-marked — the rubric is the author's, the judgement is yours/)
    ).toBeInTheDocument()
    expect(screen.getByText('Mark your answer to continue to the next question.')).toBeInTheDocument()
    expect(storedMastery()).toBeNull()
  })
})

describe('a session of two questions', () => {
  it('counts what has been answered so far', async () => {
    const user = userEvent.setup()
    const userAnswer = 'My own words about the address walk.'
    seedSession([short(), mcq()], { userAnswer })
    renderPractice('/practice/feedback')

    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Save my mark' }))

    expect(
      screen.getByText(/Session so far: 1 of 2 answered · 1 answer self-marked/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next question/ })).toBeEnabled()

    // The self-marked short answer is the only thing mastery has seen so far.
    expect(storedMastery().concepts['fixture-concept'].apply.count).toBe(1)
    expect(storedMastery().concepts['fixture-concept'].understand).toBeUndefined()
  })
})
