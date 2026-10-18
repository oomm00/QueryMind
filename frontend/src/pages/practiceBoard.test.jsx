/**
 * The practice board, through the page a student uses: pick a subject, keep the
 * topics that matter, start, and be asked only those questions.
 *
 * The board builds its subjects and topics from the course trees it is given,
 * so the fixture here has the three cases it has to speak about: a subject with
 * questions, a subject with none (disabled, and it says so), and a topic inside
 * a subject with no questions of its own.
 *
 * Nothing here depends on the authored Operating Systems course: the ids say
 * "board", the questions are about nothing in particular, and the only real
 * thing is the shape practiceBank returns.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import PracticeHomePage from './PracticeHomePage.jsx'
import SessionPage from './SessionPage.jsx'
import { readSessions } from '../lib/sessions.js'

const board = vi.hoisted(() => {
  const q = (id, prompt, bloom, conceptId) => ({
    question_id: id,
    question_text: prompt,
    type: 'mcq',
    bloom_level: bloom,
    difficulty: 'medium',
    options: ['An option', 'Another option'],
    correctIndex: 0,
    answerKey: '',
    rubric: [],
    explanation: 'The fixture says so.',
    needsHumanCheck: false,
    conceptId,
    resources: [],
  })

  const alpha = [
    q('alpha-1', 'Alpha one', 'remember', 'concept-alpha'),
    q('alpha-2', 'Alpha two', 'apply', 'concept-alpha'),
  ]
  const beta = [
    q('beta-1', 'Beta one', 'remember', 'concept-beta'),
    q('beta-2', 'Beta two', 'apply', 'concept-beta'),
  ]
  const gamma = [
    q('gamma-1', 'Gamma one', 'remember', 'concept-gamma'),
    q('gamma-2', 'Gamma two', 'apply', 'concept-gamma'),
  ]

  const topic = (id, title, subject, conceptId, questions) => ({
    id,
    title,
    subject,
    summary: '',
    concepts: [
      {
        id: conceptId,
        title,
        summary: '',
        questionCount: questions.length,
        resourceCount: 0,
        resources: [],
        lessonIds: [],
        lessons: [],
        questions,
      },
    ],
  })

  const tree = {
    id: 'board-course',
    contentId: 'board-course',
    title: 'Board course',
    subject: 'operating-systems',
    summary: 'A made-up course for the practice board.',
    level: 'beginner',
    topics: [
      topic('topic-alpha', 'Alpha topic', 'operating-systems', 'concept-alpha', alpha),
      topic('topic-beta', 'Beta topic', 'operating-systems', 'concept-beta', beta),
      topic('topic-empty', 'Empty topic', 'operating-systems', 'concept-empty', []),
      topic('topic-gamma', 'Gamma topic', 'databases', 'concept-gamma', gamma),
      topic('topic-delta', 'Delta topic', 'networks', 'concept-delta', []),
    ],
  }

  const every = [...alpha, ...beta, ...gamma]

  return {
    tree,
    catalog: [
      { id: 'board-course', title: 'Board course', summary: 'A made-up course.', level: 'Beginner' },
    ],
    questionById: Object.fromEntries(every.map((question) => [question.question_id, question])),
  }
})

vi.mock('../hooks/useCatalog', () => ({
  useCatalog: () => ({
    data: board.catalog,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
}))

vi.mock('../hooks/usePracticeData.js', () => ({
  usePracticeData: () => ({ data: [board.tree], isLoading: false }),
}))

vi.mock('../hooks/usePracticeContext.js', () => ({
  usePracticeContext: () => ({ estimates: {}, answered: {} }),
}))

// /practice opens on "Pick a topic", whose form reads the student's uploaded
// topics. These tests are about the board, so the documents are simply none.
vi.mock('../hooks/useDocuments.js', () => ({
  useDocumentTopics: () => ({ data: [], isSuccess: false, isLoading: false }),
}))

vi.mock('../content/practiceBank.js', () => ({
  resolveQuestions: (ids = []) => ids.map((id) => board.questionById[id]).filter(Boolean),
  questionIndex: () => new Map(Object.entries(board.questionById)),
  practiceCourse: () => board.tree,
  contentCourseIds: () => ['board-course'],
}))

let counter = 0
let userId = ''

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/practice" element={<PracticeHomePage />} />
          <Route path="/practice/:sessionId" element={<SessionPage />} />
          <Route path="*" element={<p>Nothing here</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

/**
 * /practice opens on "Pick a topic"; the board is the second tab. Every test
 * here is about the board, so it is opened in one step.
 */
async function openBoard(user, path = '/practice') {
  renderApp(path)
  await user.click(await screen.findByRole('tab', { name: 'Question bank' }))
}

beforeEach(() => {
  counter += 1
  userId = `board-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
})

describe('the board itself', () => {
  it('lists each subject with its question count and its estimate', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    expect(screen.getByRole('button', { name: /Operating Systems/ })).toHaveTextContent('4 questions')
    expect(screen.getByRole('button', { name: /Databases/ })).toHaveTextContent('2 questions')
    // Nothing has been answered, so there is no estimate to show - not a zero.
    expect(screen.getByRole('button', { name: /Databases/ })).toHaveTextContent('No estimate')
  })

  it('disables a subject with no questions, and says why', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    const networks = screen.getByRole('button', { name: /Networks/ })
    expect(networks).toBeDisabled()
    expect(networks).toHaveTextContent('No questions yet')
  })

  it('disables a topic with no questions, and ticks the rest', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    await user.click(screen.getByRole('button', { name: /Operating Systems/ }))

    expect(screen.getByRole('checkbox', { name: /Alpha topic/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Beta topic/ })).toBeChecked()

    const empty = screen.getByRole('checkbox', { name: /Empty topic/ })
    expect(empty).toBeDisabled()
    expect(empty).not.toBeChecked()
  })
})

describe('starting a session from the board', () => {
  it('asks only the topics left ticked, and stores nothing until the first answer', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // The board opens on the first subject in the library; pick the one with
    // the topics this test is about.
    await user.click(screen.getByRole('button', { name: /Operating Systems/ }))
    await user.click(screen.getByRole('checkbox', { name: /Beta topic/ }))

    await user.type(screen.getByLabelText(/Label this session/), 'Alpha only')
    await user.click(screen.getByRole('button', { name: /^Start practice/ }))

    // Two questions, because only Alpha topic is still ticked. Beta is never
    // asked, on the first question or the second.
    expect(await screen.findByText('Question 1 of 2')).toBeInTheDocument()
    expect(['Alpha one', 'Alpha two'].some((prompt) => screen.queryByText(prompt))).toBe(true)
    expect(screen.queryByText(/Beta one|Beta two/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument()
    expect(screen.queryByText(/Beta one|Beta two/)).not.toBeInTheDocument()

    // Started, not written: the session reaches storage with its first answer.
    expect(readSessions(userId).sessions).toEqual([])

    await user.click(screen.getAllByRole('radio')[0])

    const [session] = readSessions(userId).sessions
    expect(session.scope).toBe('custom')
    expect(session.subject).toBe('operating-systems')
    expect(session.label).toBe('Alpha only')
    expect(session.questionIds.every((id) => id.startsWith('alpha-'))).toBe(true)
    expect(session.questionIds).toHaveLength(2)
  })
})
