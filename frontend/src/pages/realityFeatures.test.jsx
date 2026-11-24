import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MasteryPage from './MasteryPage'
import WeakAreasPage from './WeakAreasPage'
import AnalyticsPage from './AnalyticsPage'
import SettingsPage from './SettingsPage'
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

describe('WeakAreasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authContextModule.useAuth.mockReturnValue({
      userId: 'user-123',
      user: { email: 'learner@example.com' },
    })
  })

  it('shows empty state when no topics have < 70% with >= 2 attempts', async () => {
    vi.spyOn(masteryApiModule.masteryApi, 'getMyMastery').mockResolvedValue([
      {
        subject: 'OS',
        topic: 'Paging',
        mastery_score: 0.88,
        attempts_count: 3,
      },
      {
        subject: 'OS',
        topic: 'Deadlocks',
        mastery_score: 0.35,
        attempts_count: 1, // Only 1 attempt -> not yet flagged as weak
      },
    ])

    render(
      <MemoryRouter>
        <WeakAreasPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('No weak areas identified')).toBeInTheDocument()
  })

  it('identifies and displays weak areas with >= 2 attempts and < 70% score', async () => {
    vi.spyOn(masteryApiModule.masteryApi, 'getMyMastery').mockResolvedValue([
      {
        subject: 'DBMS',
        topic: 'Transactions & ACID',
        mastery_score: 0.52,
        attempts_count: 3,
        last_updated: '2026-11-24T01:00:00Z',
      },
    ])

    render(
      <MemoryRouter>
        <WeakAreasPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Transactions & ACID')).toBeInTheDocument()
    expect(screen.getByText('52%')).toBeInTheDocument()
    expect(screen.getByText(/3 attempts evaluated/i)).toBeInTheDocument()
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
