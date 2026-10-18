/**
 * ExplorePage — the catalog, and what it is allowed to say about a student.
 *
 * The mock content is the obviously-fake fixture tree, and each test gets its own
 * user id so the enrollment and bookmark stores cannot leak between them.
 *
 * The point of these tests is the honesty rule: a course the student has not
 * enrolled in shows no coverage and no mastery, whatever the catalog data says,
 * and an enrolled course shows only what its own answers support.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import ExplorePage from './ExplorePage.jsx'

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

function renderExplore() {
  return render(
    <MemoryRouter initialEntries={['/explore']}>
      <AuthProvider>
        <ExplorePage />
      </AuthProvider>
    </MemoryRouter>
  )
}

function enroll(courseId) {
  window.localStorage.setItem(
    `qm_enrolled_${userId}`,
    JSON.stringify({
      version: 1,
      courses: { [courseId]: { enrolledAt: '2026-10-18T09:00:00.000Z' } },
    })
  )
}

function scoreConcept(conceptId) {
  window.localStorage.setItem(
    `qm_progress_${userId}`,
    JSON.stringify({
      version: 1,
      concepts: { [conceptId]: { remember: { value: 1, count: 1 } } },
      applied: [],
    })
  )
}

beforeEach(() => {
  counter += 1
  userId = `explore-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
})

describe('ExplorePage', () => {
  it('shows no numbers at all for a course the student has not enrolled in', () => {
    renderExplore()

    expect(screen.getByRole('heading', { name: 'Fake course' })).toBeInTheDocument()
    expect(screen.queryByText('Practice coverage')).not.toBeInTheDocument()
    expect(screen.queryByText(/estimated mastery/)).not.toBeInTheDocument()
    expect(screen.queryByText(/of 2 concepts/)).not.toBeInTheDocument()

    // What it does say is what the catalog knows: the prerequisites.
    expect(screen.getAllByText('Prerequisites:')).toHaveLength(2)
    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
  })

  it('counts the tabs from the stores and toggles a bookmark', async () => {
    const user = userEvent.setup()
    renderExplore()

    expect(screen.getByRole('tab', { name: 'All 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Enrolled 0' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Not enrolled 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Saved 0' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Fake course' }))
    expect(screen.getByRole('tab', { name: 'Saved 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Saved 1' }))
    expect(screen.getByText('1 course in Saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Fake course from saved' })).toBeInTheDocument()
  })

  it('shows coverage and mastery for an enrolled course that has answers', () => {
    enroll('fake-course')
    scoreConcept('fake-concept-a')
    renderExplore()

    expect(screen.getByText('1 of 2 concepts')).toBeInTheDocument()
    expect(screen.getByText('100% estimated mastery')).toBeInTheDocument()
  })

  it('says nothing is measured for an enrolled course with no answers', () => {
    enroll('fake-course')
    renderExplore()

    expect(screen.getByText('No practice yet — nothing measured.')).toBeInTheDocument()
    expect(screen.queryByText('Practice coverage')).not.toBeInTheDocument()
  })
})
