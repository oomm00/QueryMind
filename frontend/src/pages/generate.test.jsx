/**
 * The redesigned Practice Setup + Adaptive Session flow, through the screen a student uses.
 *
 * Verifies the core requirements:
 * 1. Setup screen: ONLY topic input, suggestion chips, uploaded-notes switch (hidden when no docs),
 *    and one primary button: "Start practice". No manual/difficulty/bloom/count controls.
 * 2. One request per question.
 * 3. Next question requested only after the previous answer is evaluated.
 * 4. Level ladder reflects the backend rung and surfaces adaptive reason.
 * 5. Finish session surfaces the end-of-session summary.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../context/AuthContext.jsx'
import PracticeHomePage from './PracticeHomePage.jsx'
import SessionPage from './SessionPage.jsx'
import { resetCustomConcepts } from '../content/registry.js'

let mockDocTopics = [{ subject: 'OS', topics: ['Deadlocks', 'Memory Management'] }]
let mockDocs = [{ title: 'OS Lecture Notes.pdf', topic: 'Deadlocks' }]

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
    resolveQuestions: (ids = [], own = []) =>
      ids
        .map((id) => (own ?? []).find((question) => question.question_id === id) ?? fixture.questionById[id])
        .filter(Boolean),
    questionIndex: () => new Map(Object.entries(fixture.questionById)),
    practiceCourse: () => fixture.practiceTree,
    contentCourseIds: () => ['fake-course'],
  }
})

vi.mock('../hooks/useDocuments.js', () => ({
  useDocumentTopics: () => ({
    data: mockDocTopics,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: () => {},
  }),
  useDocuments: () => ({
    data: mockDocs,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: () => {},
  }),
}))

let submitMock = vi.fn(async () => ({
  score: 0.85,
  overall_score: 85,
  feedback_text: 'Strong understanding demonstrated.',
  evaluation_mode: 'llm',
}))

vi.mock('../api/endpoints/attempts.js', () => ({
  attemptsApi: {
    submit: (...args) => submitMock(...args),
  },
}))

// ── Fake fetch for question generation ──────────────────────

let pending = []

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: '', json: async () => body }
}

function installFakeFetch() {
  pending = []

  vi.stubGlobal('fetch', (url, options = {}) => {
    if (!String(url).includes('/questions/generate')) {
      return Promise.resolve(jsonResponse(200, {}))
    }

    return new Promise((resolve, reject) => {
      pending.push({
        url: String(url),
        body: options.body ? JSON.parse(options.body) : null,
        resolve: (status, body) => resolve(jsonResponse(status, body)),
      })
      options.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.')
        error.name = 'AbortError'
        reject(error)
      })
    })
  })
}

async function nextCall() {
  await waitFor(() => expect(pending.length).toBeGreaterThan(0))
  return pending.shift()
}

// ── Render Helpers ──────────────────────────────────────────

let counter = 0
let userId = ''

function renderApp(path = '/practice') {
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

async function openSetup(user) {
  renderApp('/practice')
  await user.click(await screen.findByRole('tab', { name: 'Pick a topic' }))
  return screen.getByRole('textbox', { name: 'Topic' })
}

beforeEach(() => {
  counter += 1
  userId = `adaptive-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
  resetCustomConcepts()
  mockDocTopics = [{ subject: 'OS', topics: ['Deadlocks', 'Memory Management'] }]
  mockDocs = [{ title: 'OS Lecture Notes.pdf', topic: 'Deadlocks' }]
  submitMock.mockClear()
  vi.stubEnv('VITE_MOCK_QUESTIONS', 'false')
  installFakeFetch()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Practice Setup Screen', () => {
  it('renders ONLY topic input, suggestion chips, uploaded notes switch, and Start practice button', async () => {
    const user = userEvent.setup()
    const topicInput = await openSetup(user)

    expect(topicInput).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeTruthy()

    // Uploaded switch is present when documents exist, and is OFF by default
    const uploadedSwitch = screen.getByLabelText('Use only my uploaded notes')
    expect(uploadedSwitch).toBeTruthy()
    expect(uploadedSwitch.checked).toBe(false)

    // Removed controls MUST NOT be present
    expect(screen.queryByRole('button', { name: /Adaptive \(recommended\)/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Manual$/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Difficulty$/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Bloom levels$/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Number of questions$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Generate questions/i })).toBeNull()
  })

  it('hides the uploaded-notes switch completely when user has no documents', async () => {
    mockDocTopics = []
    mockDocs = []

    const user = userEvent.setup()
    await openSetup(user)

    expect(screen.queryByLabelText(/Use only my uploaded notes/i)).toBeNull()
  })

  it('populates topic from suggestion chips', async () => {
    const user = userEvent.setup()
    const topicInput = await openSetup(user)

    await user.type(topicInput, 'dead')
    const suggestion = await screen.findByRole('button', { name: 'Deadlocks' })
    await user.click(suggestion)

    expect(topicInput.value).toBe('Deadlocks')
  })
})

describe('One-at-a-time Adaptive Session Flow', () => {
  it('requests ONE question upon start, reflects rung on ladder, and requests next question ONLY after evaluation', async () => {
    const user = userEvent.setup()
    const topicInput = await openSetup(user)

    await user.type(topicInput, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Start practice' }))

    // 1. One request per question is issued upon navigating to session
    const call1 = await nextCall()
    expect(call1.body).toMatchObject({
      topic: 'Deadlocks',
      num_questions: 1,
      adaptive: true,
    })

    // Resolve Q1 at Remember / Easy
    call1.resolve(200, {
      questions: [
        {
          question_id: 'q-adaptive-1',
          question_text: 'Define what constitutes a deadlock state.',
          bloom_level: 'remember',
          difficulty: 'easy',
          source: 'bank',
          adaptive_reason: 'No prior attempts for this topic — starting at Remember/Easy.',
        },
      ],
    })

    // 2. Ladder reflects the backend rung and surfaces adaptive reason
    expect(await screen.findByText('Define what constitutes a deadlock state.')).toBeTruthy()
    const reasonEl = await screen.findByTestId('adaptive-reason')
    expect(reasonEl).toHaveTextContent(/starting at Remember\/Easy/i)
    expect(screen.getByTestId('adaptive-ladder')).toHaveTextContent(/Remember/i)

    // Verify no second request has been made yet
    expect(pending).toHaveLength(0)

    // 3. User provides answer and submits
    const answerInput = screen.getByRole('textbox', { name: 'Your answer' })
    await user.type(answerInput, 'A set of processes where each is waiting for a resource held by another.')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))

    // Evaluation card appears with score
    expect(await screen.findByTestId('evaluation-result')).toBeTruthy()
    expect(screen.getByText('85% score')).toBeTruthy()
    expect(screen.getByText('Strong understanding demonstrated.')).toBeTruthy()

    // Verify still NO next question requested before clicking "Next question"
    expect(pending).toHaveLength(0)

    // 4. Click "Next question" -> NOW request #2 is sent
    await user.click(screen.getByRole('button', { name: 'Next question →' }))

    const call2 = await nextCall()
    expect(call2.body).toMatchObject({
      topic: 'Deadlocks',
      num_questions: 1,
      adaptive: true,
    })

    // Resolve Q2 promoted to Understand / Easy
    call2.resolve(200, {
      questions: [
        {
          question_id: 'q-adaptive-2',
          question_text: 'Explain the four Coffman conditions required for deadlock.',
          bloom_level: 'understand',
          difficulty: 'easy',
          source: 'live',
          adaptive_reason: 'Scored 85% on Remember/Easy -> moving up to Understand/Easy.',
        },
      ],
    })

    // Ladder updates to Understand
    expect(await screen.findByText('Explain the four Coffman conditions required for deadlock.')).toBeTruthy()
    const updatedReason = await screen.findByTestId('adaptive-reason')
    expect(updatedReason).toHaveTextContent(/moving up to Understand\/Easy/i)

    // 5. Click "Finish session" -> Surfaces End-of-session summary
    await user.click(screen.getByRole('button', { name: 'Finish session' }))
    // Confirm dialog
    const confirmBtn = await screen.findByRole('button', { name: 'Confirm finish' })
    await user.click(confirmBtn)

    expect(await screen.findByTestId('session-summary')).toBeTruthy()
    expect(screen.getByText('Session Complete')).toBeTruthy()
    expect(screen.getByText('Questions Answered')).toBeTruthy()
    expect(screen.getByText('Average Score')).toBeTruthy()
    expect(screen.getByText('Highest Rung Reached')).toBeTruthy()
  })
})
