/**
 * Enrolment, through the pages a student uses.
 *
 * Adding a course to My courses is a deliberate act with two ways in: the
 * Enroll button, which asks the two optional questions first, and any Start
 * practice button on a course that is not in My courses yet, which enrols as it
 * starts and says so. Removing it is deliberate too, and it keeps every answer.
 *
 * The content loader is mocked with the obviously-fake fixture tree.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import { FlashHost } from '../components/routing/FlashHost.jsx'
import CoursePage from './course/CoursePage.jsx'
import CoursePracticeTab from './course/CoursePracticeTab.jsx'
import CourseAboutTab from './course/CourseAboutTab.jsx'
import SessionPage from './SessionPage.jsx'
import MyCoursesPage from './MyCoursesPage.jsx'

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
        <FlashHost />
        <Routes>
          <Route path="/course/:id" element={<CoursePage />}>
            <Route index element={<CoursePracticeTab />} />
            <Route path="about" element={<CourseAboutTab />} />
          </Route>
          <Route path="/practice/:sessionId" element={<SessionPage />} />
          <Route path="/courses" element={<MyCoursesPage />} />
          <Route path="/explore" element={<p>Explore</p>} />
          <Route path="*" element={<p>Nothing here</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

/** What the enrollment store holds for this test's user. */
function storedEnrollments() {
  const raw = window.localStorage.getItem(`qm_enrolled_${userId}`)
  return raw ? JSON.parse(raw).courses : {}
}

beforeEach(() => {
  counter += 1
  userId = `enroll-user-${counter}`
  window.localStorage.setItem('qm_user_id', userId)
})

describe('enrolling', () => {
  it('adds the course to My courses from the Enroll dialog, with the goal', async () => {
    const user = userEvent.setup()
    renderApp('/course/fake-course')

    await user.click(await screen.findByRole('button', { name: 'Enroll' }))
    await user.type(await screen.findByLabelText('Goal (optional)'), 'Pass the fake exam')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enroll' }))

    expect(await screen.findByText('Enrolled')).toBeInTheDocument()
    expect(storedEnrollments()['fake-course'].goal).toBe('Pass the fake exam')
  })

  it('enrols from Start practice on a course that is not in My courses yet', async () => {
    const user = userEvent.setup()
    renderApp('/course/fake-course')

    await user.click(await screen.findByRole('button', { name: 'Start practice' }))

    expect(await screen.findByText('Question 1 of 6')).toBeInTheDocument()
    expect(screen.getByText('Added to My courses')).toBeInTheDocument()
    expect(storedEnrollments()['fake-course']).toBeTruthy()
  })

  it('Skips without enrolling', async () => {
    const user = userEvent.setup()
    renderApp('/course/fake-course')

    await user.click(await screen.findByRole('button', { name: 'Enroll' }))
    await user.click(await screen.findByRole('button', { name: 'Skip' }))

    expect(storedEnrollments()).toEqual({})
    expect(screen.getByRole('button', { name: 'Enroll' })).toBeInTheDocument()
  })
})

describe('removing a course', () => {
  it('hides it from My courses and keeps the answers', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      `qm_enrolled_${userId}`,
      JSON.stringify({ version: 1, courses: { 'fake-course': { enrolledAt: '2026-10-18T09:00:00.000Z' } } })
    )
    // An answer that must survive the removal.
    window.localStorage.setItem(
      `qm_progress_${userId}`,
      JSON.stringify({
        version: 1,
        concepts: { 'fake-concept-a': { remember: { value: 1, count: 1 } } },
        applied: [],
      })
    )

    renderApp('/course/fake-course/about')

    await user.click(await screen.findByRole('button', { name: 'Remove from my courses' }))
    await user.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(await screen.findByText("You haven't enrolled in a course yet")).toBeInTheDocument()
    expect(storedEnrollments()).toEqual({})

    const progress = JSON.parse(window.localStorage.getItem(`qm_progress_${userId}`))
    expect(progress.concepts['fake-concept-a'].remember).toMatchObject({ value: 1, count: 1 })
  })
})
