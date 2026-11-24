import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MasteryPage from './MasteryPage'
import AnalyticsPage from './AnalyticsPage'
import SettingsPage from './SettingsPage'
import HistoryPage from './HistoryPage'
import * as masteryApiModule from '../api/endpoints/mastery.js'
import * as attemptsApiModule from '../api/endpoints/attempts.js'
import * as authContextModule from '../context/AuthContext.jsx'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(async (url) => {
    if (url === '/auth/me') {
      return {
        user_id: 'user-123',
        email: 'learner@example.com',
        full_name: 'Test Learner',
        is_active: true,
        created_at: '2026-10-01T12:00:00Z',
      }
    }
    return {}
  }),
}))

describe('MasteryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com' },
    })
  })

  it('renders empty state when learner has no mastery records', async () => {
    vi.spyOn(masteryApiModule.masteryApi, 'getMyMastery').mockResolvedValue([])

    render(
      <MemoryRouter>
        <MasteryPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('No mastery records yet')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument() // Average mastery
  })

  it('renders real topic mastery records from /mastery/me', async () => {
    vi.spyOn(masteryApiModule.masteryApi, 'getMyMastery').mockResolvedValue([
      {
        subject: 'DBMS',
        topic: 'Deadlocks',
        mastery_score: 0.85,
        attempts_count: 4,
        bloom_breakdown: { remember: 1.0, understand: 0.8 },
        last_updated: '2026-11-24T01:00:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <MasteryPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Deadlocks')).toBeInTheDocument()
    expect(screen.getAllByText('85%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/4 attempts/i)).toBeInTheDocument()
    expect(screen.getByText('Level: Understand / Easy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Practice$/i })).toBeInTheDocument()
  })
})

describe('AnalyticsPage Focus Areas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com' },
    })
  })

  it('shows empty state when no topics have < 70%', async () => {
    vi.spyOn(attemptsApiModule.attemptsApi, 'getHistory').mockResolvedValue([
      {
        attempt_id: 'att-1',
        topic: 'Paging',
        bloom_level: 'understand',
        difficulty: 'easy',
        score: 0.88,
        submitted_at: '2026-11-24T08:00:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText(/No topics currently fall below the 70% threshold/i)).toBeInTheDocument()
  })

  it('identifies and displays weak focus areas under 70% score with Practice this button', async () => {
    vi.spyOn(attemptsApiModule.attemptsApi, 'getHistory').mockResolvedValue([
      {
        attempt_id: 'att-1',
        topic: 'Transactions & ACID',
        bloom_level: 'understand',
        difficulty: 'easy',
        score: 0.52,
        submitted_at: '2026-11-24T08:00:00Z',
      },
      {
        attempt_id: 'att-2',
        topic: 'Transactions & ACID',
        bloom_level: 'apply',
        difficulty: 'medium',
        score: 0.48,
        submitted_at: '2026-11-24T08:05:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    )

    expect((await screen.findAllByText('Transactions & ACID')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Practice this' })).toBeInTheDocument()
  })
})

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com' },
    })
  })

  it('shows empty state when learner has no attempt history', async () => {
    vi.spyOn(attemptsApiModule.attemptsApi, 'getHistory').mockResolvedValue([])

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('No analytics data yet')).toBeInTheDocument()
  })

  it('plots score over time and daily volume from real attempt history', async () => {
    vi.spyOn(attemptsApiModule.attemptsApi, 'getHistory').mockResolvedValue([
      {
        attempt_id: 'att-1',
        topic: 'Deadlocks',
        bloom_level: 'remember',
        difficulty: 'easy',
        score: 1.0,
        submitted_at: '2026-11-24T08:00:00Z',
      },
      {
        attempt_id: 'att-2',
        topic: 'Deadlocks',
        bloom_level: 'understand',
        difficulty: 'easy',
        score: 0.5,
        submitted_at: '2026-11-24T08:05:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Score Over Time')).toBeInTheDocument()
    expect(screen.getByText('Daily Activity Volume')).toBeInTheDocument()
    expect(screen.getByText('Cognitive Level Progression')).toBeInTheDocument()
    expect(screen.getByText('Topic Performance Breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('75%').length).toBeGreaterThanOrEqual(1) // Average score
  })
})

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders account identity and sign out button', async () => {
    const logoutMock = vi.fn()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com', full_name: 'Test Learner' },
      logout: logoutMock,
    })

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('learner@example.com')).toBeInTheDocument()
    expect(screen.getByText('Test Learner')).toBeInTheDocument()
    expect(screen.getByText('Restrained Dark')).toBeInTheDocument()

    const signOutBtn = screen.getByRole('button', { name: 'Sign out' })
    expect(signOutBtn).toBeInTheDocument()
    fireEvent.click(signOutBtn)
    expect(logoutMock).toHaveBeenCalled()
  })
})

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com' },
    })
  })

  it('numbers questions chronologically within a session (Q1 = earliest answered)', async () => {
    // API returns newest first (Q4 -> Q1)
    vi.spyOn(attemptsApiModule.attemptsApi, 'getHistory').mockResolvedValue([
      {
        attempt_id: 'att-4',
        topic: 'Deadlocks',
        bloom_level: 'understand',
        score: 0.62,
        created_at: '2026-11-24T08:15:00Z',
      },
      {
        attempt_id: 'att-3',
        topic: 'Deadlocks',
        bloom_level: 'apply',
        score: 0.0,
        created_at: '2026-11-24T08:10:00Z',
      },
      {
        attempt_id: 'att-2',
        topic: 'Deadlocks',
        bloom_level: 'understand',
        score: 1.0,
        created_at: '2026-11-24T08:05:00Z',
      },
      {
        attempt_id: 'att-1',
        topic: 'Deadlocks',
        bloom_level: 'remember',
        score: 1.0,
        created_at: '2026-11-24T08:00:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Practice History')).toBeInTheDocument()
    // Find all question labels
    const qLabels = screen.getAllByText(/^Q[1-4]$/).map((el) => el.textContent)
    expect(qLabels).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])

    // Verify Q1 corresponds to the earliest attempt (att-1: Remember, score 100%)
    const q1Row = screen.getByText('Q1').closest('div')
    expect(q1Row).toHaveTextContent(/Remember/i)
  })
})
