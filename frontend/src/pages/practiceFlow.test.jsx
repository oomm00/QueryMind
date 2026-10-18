/**
 * The practice flow, through the pages a student uses: a course, a session and
 * its results.
 *
 * The content loader is mocked with the obviously-fake fixture tree, so these
 * tests are about the flow - what a button does, what the strip says, what is
 * scored and what is waiting to be marked - and never about the authored course.
 * Each test gets its own user id, because the session store caches per user.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import CoursePage from './course/CoursePage.jsx'
import CoursePracticeTab from './course/CoursePracticeTab.jsx'
import SessionPage from './SessionPage.jsx'
import ResultsPage from './ResultsPage.jsx'

vi.mock('../hooks/useCatalog', async () => {
  const fixture = await import('../__fixtures__/practice.js')
  return {
    useCatalog: () => ({
      data: fixture.catalog,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => {},
    }),
  }
})

vi.mock('../hooks/usePracticeData.js', async () => {
  const fixture = await import('../__fixtures__/practice.js')
  return { usePracticeData: () => ({ data: [fixture.practiceTree], isLoading: false }) }
})

vi.mock('../hooks/usePracticeContext.js', () => ({
  usePracticeContext: () => ({ estimates: {}, answered: {} }),
}))

vi.mock('../content/practiceBank.js', async () => {
  const fixture = await import('../__fixtures__/practice.js')
  return {
    resolveQuestions: (ids = []) => ids.map((id) => fixture.questionById[id]).filter(Boolean),
    questionIndex: () => new Map(Object.entries(fixture.questionById)),
    practiceCourse: () => fixture.practiceTree,
    contentCourseIds: () => ['fake-course'],
  }
})

let counter = 0
let userId = ''

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/course/:id" element={<CoursePage />}>
            <Route index element={<CoursePracticeTab />} />
            <Route path="material" element={<p>Study material tab</p>} />
            <Route path="progress" element={<p>Progress tab</p>} />
            <Route path="about" element={<p>About tab</p>} />
          </Route>
          <Route path="/practice/:sessionId" element={<SessionPage />} />
          <Route path="/practice/:sessionId/results" element={<ResultsPage />} />
          <Route path="/practice" element={<p>Practice home</p>} />
          <Route path="/courses" element={<p>My courses</p>} />
          <Route path="/explore" element={<p>Explore</p>} />
          <Route path="*" element={<p>Nothing here</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  counter += 1
  userId = `fake-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
})

/** Open the fake course and press the header's Start practice. */
async function startSession(user, level) {
  renderApp('/course/fake-course')
  await screen.findByRole('button', { name: 'Start practice' })
  if (level) await user.click(screen.getByRole('button', { name: level }))
  await user.click(screen.getByRole('button', { name: 'Start practice' }))
  return screen.findByText(/^Question 1 of \d+$/)
}

async function answerAndSubmit(user) {
  await user.click(screen.getByRole('radio', { name: 'Fake cache' }))
  await user.click(screen.getByRole('button', { name: 'Question 6, unanswered' }))
  await user.click(screen.getByRole('button', { name: 'Review and submit' }))
  await user.click(await screen.findByRole('button', { name: 'Submit' }))
  return screen.findByText('Practice results')
}

function storedProgress() {
  return JSON.parse(window.localStorage.getItem(`qm_progress_${userId}`) || 'null')
}

describe('starting a session', () => {
  it('opens on question one, with nothing to set up in between', async () => {
    const user = userEvent.setup()
    await startSession(user)

    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument()
    expect(screen.getByText('0 answered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exit practice/ })).toBeInTheDocument()

    // The old setup form asked for these; a session now just starts.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/how many questions/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/set up your practice/i)).not.toBeInTheDocument()
  })

  it('lets the strip jump to the first and the last question', async () => {
    const user = userEvent.setup()
    await startSession(user)

    await user.click(screen.getByRole('button', { name: 'Question 6, unanswered' }))
    expect(screen.getByText('Question 6 of 6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Question 1, unanswered' }))
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument()
  })

  it('asks the level the student picked: easy starts on a remember question', async () => {
    const user = userEvent.setup()
    await startSession(user, 'Easy')

    expect(screen.getByTitle('Recall facts & basic concepts')).toBeInTheDocument()
    expect(screen.getByText(/Not enough easy questions here/)).toBeInTheDocument()
  })

  it('and hard starts on an evaluate question, with its own set', async () => {
    const user = userEvent.setup()
    await startSession(user, 'Hard')

    expect(screen.getByTitle('Justify a stand or decision')).toBeInTheDocument()
    expect(screen.getByText('Not enough hard questions here, so a few are medium.')).toBeInTheDocument()
    // Two evaluate/create questions, filled up from the medium band.
    expect(screen.getByText('Question 1 of 5')).toBeInTheDocument()
  })
})

describe('answering', () => {
  it('clears a choice and counts what is answered', async () => {
    const user = userEvent.setup()
    await startSession(user)

    await user.click(screen.getByRole('radio', { name: 'Fake cache' }))
    expect(screen.getByText('1 answered')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear answer' }))
    expect(screen.getByText('0 answered')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Fake cache' })).not.toBeChecked()
  })

  it('saves a written answer as it is typed', async () => {
    const user = userEvent.setup()
    await startSession(user)

    await user.click(screen.getByRole('button', { name: 'Question 4, unanswered' }))
    await user.type(screen.getByLabelText('Your answer'), 'It fills from the invented store.')

    expect(screen.getByText('1 answered')).toBeInTheDocument()
    expect(screen.getByLabelText('Your answer')).toHaveValue('It fills from the invented store.')
  })

  it('says what is unfinished before submitting', async () => {
    const user = userEvent.setup()
    await startSession(user)

    await user.click(screen.getByRole('radio', { name: 'Fake cache' }))
    await user.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    await user.click(screen.getByRole('button', { name: 'Flag for review' }))
    await user.click(screen.getByRole('button', { name: 'Question 6, unanswered' }))
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))

    expect(await screen.findByText('5 unanswered, 1 flagged. Submit anyway?')).toBeInTheDocument()
  })
})

describe('the results', () => {
  it('shows the right answer, scores what was answered, and moves mastery', async () => {
    const user = userEvent.setup()
    await startSession(user)
    await answerAndSubmit(user)

    // Every question is multiple choice, so there is one "Correct answer" per
    // item; the first is the question that was answered.
    const correct = screen.getAllByText('Correct answer')[0].closest('div')
    expect(correct).toHaveTextContent('Fake cache')

    expect(screen.getByText('1 of 1 mark')).toBeInTheDocument()
    expect(
      screen.getByText(/5 answers are not in the score: 4 unanswered, 1 written but not marked yet/)
    ).toBeInTheDocument()

    expect(storedProgress().concepts['fake-concept-a'].remember).toMatchObject({
      value: 1,
      count: 1,
    })
  })

  it('waits for a written answer to be marked, and scores it when it is', async () => {
    const user = userEvent.setup()
    await startSession(user)

    // Question four is the fake evaluate question, which is written, so nothing
    // is scored until the student marks it against its rubric.
    await user.click(screen.getByRole('button', { name: 'Question 4, unanswered' }))
    await user.type(screen.getByLabelText('Your answer'), 'From the invented store, one at a time.')
    await user.click(screen.getByRole('button', { name: 'Question 6, unanswered' }))
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
    await user.click(await screen.findByRole('button', { name: 'Submit' }))
    await screen.findByText('Practice results')

    expect(screen.getByText('No score yet')).toBeInTheDocument()
    expect(screen.getByText(/1 written but not marked yet/)).toBeInTheDocument()
    expect(screen.getByText(/Not marked yet — left out of the score above/)).toBeInTheDocument()
    expect(storedProgress()).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: /Weighs repeat reads against cost/ }))

    // Two of the four rubric points, on a three mark question: half of three.
    expect(await screen.findByText(/2 of 4 rubric points/)).toBeInTheDocument()
    expect(screen.getByText('1.5 of 3 marks')).toBeInTheDocument()
    expect(storedProgress().concepts['fake-concept-b'].evaluate).toMatchObject({
      value: 0.5,
      count: 1,
    })
  })
})
