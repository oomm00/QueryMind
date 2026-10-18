/**
 * The "Pick a topic" form, through the screen a student uses, with a fake fetch
 * standing in for the backend.
 *
 * The point of going through fetch rather than mocking the endpoint is that the
 * whole path is exercised: the request the panel builds, the adapter that
 * renames it, the code-to-sentence mapping when the backend refuses, and the
 * run that turns N answers of one question into N questions.
 *
 * The fetch is a queue the test answers by hand, so a run can be watched
 * half-finished - which is the only way to check the progress line and Cancel.
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

function questionPayload(bloom, index) {
  return {
    questions: [
      {
        question_id: `gen-${index}`,
        question_text: `A generated ${bloom} question, number ${index}.`,
        bloom_level: bloom,
        difficulty: 'medium',
      },
    ],
  }
}

/** Answer the next call with one generated question. */
async function answerWithQuestion() {
  const call = await nextCall()
  answered += 1
  call.resolve(200, questionPayload(call.body.bloom_level, answered))
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
  it('asks one question at a time, reports progress, and offers what arrived', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const first = await nextCall()
    // One question per call, filed under the subject of the document it matched.
    expect(first.body).toMatchObject({ topic: 'Deadlocks', subject: 'OS', num_questions: 1 })
    expect(['apply', 'analyze']).toContain(first.body.bloom_level)
    first.resolve(200, questionPayload(first.body.bloom_level, 1))

    await answerWithQuestion()
    await answerWithQuestion()

    // Two slots, so a third is already in flight and the run is visibly done
    // with half of it.
    expect(await screen.findByText('3 of 6 ready')).toBeTruthy()
    expect(screen.getByText(/Analyze questions can take up to 30 seconds/)).toBeTruthy()

    await answerWithQuestion()
    await answerWithQuestion()
    await answerWithQuestion()

    expect(await screen.findByText('6 questions ready')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeTruthy()
    // Every question carries its Bloom chip and its source.
    expect(screen.getAllByText('Generated')).toHaveLength(6)
  })

  it('stops the calls still out when Cancel is pressed, and keeps what arrived', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))
    await answerWithQuestion()

    expect(await screen.findByText('1 of 6 ready')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('1 question ready')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start with 1 question' })).toBeTruthy()
  })

  it('asks a duplicate again at another level rather than losing the run', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlocks')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    const duplicate = await answerWithCode('DUPLICATE_QUESTION', 409)
    const retry = await nextCall()

    expect(retry.body.bloom_level).not.toBe(duplicate.body.bloom_level)
    retry.resolve(200, questionPayload(retry.body.bloom_level, 1))

    await answerWithQuestion()
    await answerWithQuestion()
    await answerWithQuestion()
    await answerWithQuestion()
    await answerWithQuestion()

    expect(await screen.findByText('6 questions ready')).toBeTruthy()
  })

  it('offers the topic the student does have when nothing matches', async () => {
    const user = userEvent.setup()
    const topic = await openAnyTopic(user)

    await user.type(topic, 'Deadlock')
    await user.click(screen.getByRole('button', { name: 'Generate questions' }))

    await answerWithCode('NO_CONTEXT', 404)
    // The other slot was already out; it finishes into a run that has stopped.
    await answerWithQuestion()

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
    await answerWithQuestion()

    await screen.findByText('1 of 6 ready')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
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
