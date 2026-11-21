/**
 * The "Pick a topic" form, through the screen a student uses, with a fake fetch
 * standing in for the backend.
 *
 * The point of going through fetch rather than mocking the endpoint is that the
 * whole path is exercised: the request the panel builds, the adapter that
 * renames it, the code-to-sentence mapping when the backend refuses, and the
 * run that turns one batch into N questions.
 *
 * The fetch is a queue the test answers by hand, so the single request can be
 * inspected and answered exactly when the test wants - cancellation included.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../context/AuthContext.jsx'
import PracticeHomePage from './PracticeHomePage.jsx'
import SessionPage from './SessionPage.jsx'
import ResultsPage from './ResultsPage.jsx'
import { getKnowledgeNodes, resetCustomConcepts } from '../content/registry.js'
import { estimatesFrom } from '../lib/mastery.js'
import { readProgress } from '../lib/masteryStore.js'

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
    // The second argument is the session's own questions, which is exactly the
    // one thing a generated session has and a bank session does not.
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
    data: [{ subject: 'OS', topics: ['Deadlocks', 'Memory Management'] }],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: () => {},
  }),
  useDocuments: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: () => {},
  }),
}))

vi.mock('../api/endpoints/attempts.js', () => ({
  attemptsApi: { submit: vi.fn(async () => ({ score: 0.8, feedback_text: 'Marked.' })) },
}))

// ── A fake fetch the test drives by hand ────────────────────

let pending = []
let answered = 0

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: '', json: async () => body }
}

function installFakeFetch() {
  pending = []
  answered = 0

  vi.stubGlobal('fetch', (url, options = {}) => {
    // Anything that is not a generation call answers straight away, so the
    // queue only ever holds the calls this test is about.
    if (!String(url).includes('/questions/generate')) {
      return Promise.resolve(jsonResponse(200, {}))
    }

    return new Promise((resolve, reject) => {
      pending.push({
        url: String(url),
        body: options.body ? JSON.parse(options.body) : null,
        resolve: (status, body) => resolve(jsonResponse(status, body)),
      })
      // The panel cancels through an AbortController; a real fetch would reject.
      options.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.')
        error.name = 'AbortError'
        reject(error)
      })
    })
  })
}

/** The next generation call the panel has made. */
async function nextCall() {
  await waitFor(() => expect(pending.length).toBeGreaterThan(0))
  return pending.shift()
}

/** The backend now returns the whole run in ONE response. */
function questionBatch(count, bloom = 'apply') {
  return {
    questions: Array.from({ length: count }, (_, index) => ({
      question_id: `gen-${index + 1}`,
      question_text: `A generated ${bloom} question, number ${index + 1}.`,
      bloom_level: bloom,
      difficulty: 'medium',
      source: 'live',
      adaptive_reason: 'moving up after strong answers',
    })),
  }
}

/** Answer the single generation call with a complete batch. */
async function answerWithBatch(count = 6, bloom = 'apply') {
  const call = await nextCall()
  answered += 1
  call.resolve(200, questionBatch(count, bloom))
  return call
}

/** Answer the next call with a backend refusal. */
async function answerWithCode(code, status = 400) {
  const call = await nextCall()
  call.resolve(status, { detail: 'Written for the logs.', code })
  return call
}

// ── The app under test ──────────────────────────────────────

let counter = 0
let userId = ''

function renderApp(path = '/practice') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/practice" element={<PracticeHomePage />} />
          <Route path="/practice/:sessionId" element={<SessionPage />} />
          <Route path="/practice/:sessionId/results" element={<ResultsPage />} />
          <Route path="*" element={<p>Nothing here</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

/** Open /practice, which opens on the "Pick a topic" tab. */
async function openAnyTopic(user) {
  renderApp()
  await user.click(await screen.findByRole('tab', { name: 'Pick a topic' }))
  return screen.getByRole('textbox', { name: 'Topic' })
}

beforeEach(() => {
  counter += 1
  userId = `generate-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
  resetCustomConcepts()
  // The question endpoint is the one thing here that must go to fetch.
  vi.stubEnv('VITE_MOCK_QUESTIONS', 'false')
  installFakeFetch()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the form', () => {
  it('asks for a topic, not a subject, and never opens a menu', async () => {
    const user = userEvent.setup()
    await openAnyTopic(user)

    expect(screen.getByRole('textbox', { name: 'Topic' })).toBeTruthy()
    // A <select> would render as a combobox. There is not one on the page, and
    // no Subject field to pair it with.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/subject/i)).toBeNull()
  })

  it('starts adaptive, with Manual as an explicit override', async () => {
    const user = userEvent.setup()
    await openAnyTopic(user)

    const adaptive = screen.getByRole('button', { name: 'Adaptive (recommended)' })
    const manual = screen.getByRole('button', { name: 'Manual' })
    expect(adaptive.getAttribute('aria-pressed')).toBe('true')
    expect(manual.getAttribute('aria-pressed')).toBe('false')

    await user.click(manual)
    expect(manual.getAttribute('aria-pressed')).toBe('true')
    expect(adaptive.getAttribute('aria-pressed')).toBe('false')
  })

  it('starts the chips from the difficulty and lets them be moved', async () => {
    const user = userEvent.setup()
    await openAnyTopic(user)

    // Medium is apply + analyze.
    expect(screen.getByRole('button', { name: 'Apply' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Analyze' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Remember' }).getAttribute('aria-pressed')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Hard' }))

    expect(screen.getByRole('button', { name: 'Evaluate' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Create' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Apply' }).getAttribute('aria-pressed')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect(screen.getByRole('button', { name: 'Remember' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('offers the topics the student uploaded, and takes the subject from them', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'dead')

    const suggestion = await screen.findByRole('button', { name: 'Deadlocks' })
    await user.click(suggestion)

    expect(topic.value).toBe('Deadlocks')

    // Free text is still allowed: the suggestions never take the field over.
    await user.clear(topic)
    await user.type(topic, 'Something the library has never heard of')
    expect(topic.value).toBe('Something the library has never heard of')
  })
})

describe('a run', () => {
  it('makes ONE call for the whole run, reports the ready count and offers the batch', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const call = await nextCall()
    // One request for six questions, filed under the subject of the document it matched.
    expect(call.body).toMatchObject({
      topic: 'Deadlocks',
      subject: 'OS',
      num_questions: 6,
      adaptive: true,
    })
    expect(await screen.findByText('0 of 6 ready')).toBeTruthy()
    expect(screen.getByText(/Analyze questions can take up to 30 seconds/)).toBeTruthy()

    call.resolve(200, questionBatch(6))

    expect(await screen.findByText('6 questions ready')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeTruthy()
    expect(screen.getAllByText('Generated')).toHaveLength(6)
    expect(pending).toHaveLength(0)
  })

  it('shows why the adaptive rung was chosen once the batch is ready', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))
    await answerWithBatch(2)

    expect(await screen.findByTestId('adaptive-reason')).toHaveTextContent(
      'moving up after strong answers'
    )
  })

  it('sends the chosen levels when the student switches to Manual', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Manual' }))
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const call = await nextCall()
    expect(call.body).toMatchObject({
      adaptive: false,
      bloom_level: 'apply',
      difficulty: 'medium',
    })
    call.resolve(200, {
      questions: [
        { question_id: 'gen-1', question_text: 'A manual question.', bloom_level: 'apply' },
      ],
    })

    expect(await screen.findByText('1 question ready')).toBeTruthy()
    expect(screen.queryByTestId('adaptive-reason')).toBeNull()
  })

  it('cancels the single request cleanly without inventing questions', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const call = await nextCall()
    expect(await screen.findByText('0 of 6 ready')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: 'Generate questions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start with/ })).toBeNull()
    expect(call.body.num_questions).toBe(6)
  })

  it('lets the backend own duplicate retries: one call still fills the run', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const call = await nextCall()
    // The server retries DUPLICATE_QUESTION with another angle; the browser does
    // not fan out again, and a full batch still arrives.
    call.resolve(200, questionBatch(6, 'analyze'))
    expect(await screen.findByText('6 questions ready')).toBeTruthy()
    expect(pending).toHaveLength(0)
  })

  it('offers the topic the student does have when the backend reports NO_CONTEXT', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlock')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    await answerWithCode('NO_CONTEXT', 404)

    expect(await screen.findByText(/No material found for .Deadlock./)).toBeTruthy()

    const fillIn = screen.getByRole('button', { name: /^Use / })
    await user.click(fillIn)

    expect(topic.value).toBe('Deadlocks')
  })

  it('says there is no material at all when nothing is even close', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    // The box starts on for a student who has documents.
    expect(screen.getByRole('checkbox', { name: 'Use only my uploaded material' }).checked).toBe(true)

    await user.type(topic, 'Quantum error correction')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    expect(
      await screen.findByText('No uploaded material covers this topic. Add notes in My notes > Documents.')
    ).toBeTruthy()
    // Nothing came within reach of the topic, so nothing was asked for.
    expect(pending).toHaveLength(0)
  })
})

describe('the questions it produced', () => {
  it('are practised in an ordinary session, and their mastery lands on the typed topic', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))
    await answerWithBatch(1)

    expect(await screen.findByText('1 question ready')).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Start with 1 question' }))

    // The same session screen the question bank uses.
    expect(await screen.findByText(/^Question 1 of 1$/)).toBeTruthy()
    expect(screen.getByText('Generated')).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Two threads each holding a lock.')
    await user.click(screen.getByRole('button', { name: 'Review and submit' }))
    await user.click(await screen.findByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(readProgress(userId).concepts['custom:deadlocks']).toBeTruthy()
    })

    const estimates = estimatesFrom(readProgress(userId).concepts)
    const nodes = getKnowledgeNodes(estimates)
    const node = nodes.find((entry) => entry.id === 'custom:deadlocks')

    expect(node).toBeTruthy()
    expect(node.custom).toBe(true)
    expect(node.title).toBe('Deadlocks')
    expect(node.subject).toBe('OS')
    expect(node.estimate).toBeGreaterThan(0)
  })
})
