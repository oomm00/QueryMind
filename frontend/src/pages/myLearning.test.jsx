import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import MyLearningPage from './MyLearningPage.jsx'
import TopicDetailPage from './TopicDetailPage.jsx'
import { AuthProvider } from '../context/AuthContext.jsx'

// Mock learning API
let mockTopics = []
let mockTopicDetail = null

vi.mock('../api/endpoints/learning.js', () => ({
  fetchLearningTopics: vi.fn(async () => mockTopics),
  fetchLearningTopic: vi.fn(async () => mockTopicDetail),
  enrollLearningTopic: vi.fn(async (topic, subject) => ({ id: 'new-id', topic, subject })),
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ userId: 'test-user-123', isAuthenticated: true }),
  AuthProvider: ({ children }) => <div>{children}</div>,
}))

describe('My Learning Flow', () => {
  beforeEach(() => {
    mockTopics = []
    mockTopicDetail = null
    vi.clearAllMocks()
  })

  it('renders empty state with quick chips when no topics in learning plan', async () => {
    render(
      <MemoryRouter initialEntries={['/my-learning']}>
        <Routes>
          <Route path="/my-learning" element={<MyLearningPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('No topics in your learning plan yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deadlocks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Paging and Virtual Memory' })).toBeTruthy()
  })

  it('renders learning cards with title, subject, progress, and rung', async () => {
    mockTopics = [
      {
        id: 'topic-1',
        title: 'Deadlocks',
        subject: 'Operating Systems',
        progress_pct: 65,
        current_rung: 'Apply / Medium',
        questions_attempted: 6,
      },
      {
        id: 'topic-2',
        title: 'TCP Congestion Control',
        subject: 'Networking',
        progress_pct: 20,
        current_rung: 'Understand / Easy',
        questions_attempted: 2,
      },
    ]

    render(
      <MemoryRouter initialEntries={['/my-learning']}>
        <Routes>
          <Route path="/my-learning" element={<MyLearningPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Deadlocks')).toBeTruthy()
    expect(screen.getByText('Operating Systems')).toBeTruthy()
    expect(screen.getByText('65%')).toBeTruthy()
    expect(screen.getByText('Apply / Medium')).toBeTruthy()

    expect(screen.getByText('TCP Congestion Control')).toBeTruthy()
    expect(screen.getByText('Networking')).toBeTruthy()
  })

  it('renders topic outline with 5 subparts, status badges, and resource links', async () => {
    mockTopicDetail = {
      id: 'topic-1',
      topic: 'Deadlocks',
      subject: 'Operating Systems',
      overview: 'System state where a set of processes are blocked because each holds resources needed by others.',
      progress: {
        mastery_score: 0.6,
        mastery_pct: 60,
        total_attempts: 5,
        current_rung: 'Apply / Medium',
        completed_subparts: 2,
      },
      subparts: [
        {
          id: 'dl-01',
          title: 'Foundations & Definitions',
          summary: 'Mutual exclusion, hold and wait, no preemption, circular wait.',
          learning_goals: ['State Coffman conditions'],
        },
        {
          id: 'dl-02',
          title: 'Resource Allocation Graphs & Detection',
          summary: 'Cycle detection algorithms and graph modeling.',
          learning_goals: ['Trace RAG cycles'],
        },
        {
          id: 'dl-03',
          title: 'Banker’s Algorithm & Avoidance',
          summary: 'Safe states and resource matrices.',
          learning_goals: ['Execute safe state check'],
        },
        {
          id: 'dl-04',
          title: 'Recovery Mechanisms & Preemption',
          summary: 'Process termination and rollback.',
          learning_goals: ['Evaluate rollback strategies'],
        },
        {
          id: 'dl-05',
          title: 'Real-World Concurrency in Linux & DBMS',
          summary: 'Lock hierarchies and practical deadlock avoidance.',
          learning_goals: ['Design deadlock-free locking schemas'],
        },
      ],
      resources: [
        {
          title: 'Wikipedia: Deadlock',
          url: 'https://en.wikipedia.org/wiki/Deadlock_(computer_science)',
        },
      ],
    }

    render(
      <MemoryRouter initialEntries={['/my-learning/topic-1']}>
        <Routes>
          <Route path="/my-learning/:topicId" element={<TopicDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Topic Learning Outline')).toBeTruthy()
    expect(screen.getByText('Foundations & Definitions')).toBeTruthy()
    expect(screen.getByText('Banker’s Algorithm & Avoidance')).toBeTruthy()
    expect(screen.getByText('Wikipedia: Deadlock')).toBeTruthy()

    // Subpart status badges: 2 completed (parts 0 and 1), 1 current (part 2)
    const completedBadges = screen.getAllByText('Completed')
    expect(completedBadges.length).toBe(2)
    expect(screen.getByText('In Progress')).toBeTruthy()
    expect(screen.getAllByText('Upcoming').length).toBe(2)

    // Practice button
    expect(screen.getByRole('button', { name: /Continue Practice/i })).toBeTruthy()
  })
})
