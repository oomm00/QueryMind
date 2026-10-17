/**
 * App — root router.
 *
 * Public:  /login
 * Default: /explore (redirect target after sign-in)
 * Built:   /dashboard, /history, /practice/{new,session,feedback},
 *          /learn/:courseId/:topicId/:lessonId
 * Stubs:   everything else renders <ComingSoon/>.
 *
 * Legacy paths (/setup, /question, /feedback) redirect to their new homes.
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import QuestionPage from './pages/QuestionPage'
import FeedbackPage from './pages/FeedbackPage'
import DashboardPage from './pages/DashboardPage'
import ExplorePage from './pages/ExplorePage'
import HistoryPage from './pages/HistoryPage'
import NotFoundPage from './pages/NotFoundPage'
import ComingSoon from './pages/ComingSoon'
import LessonPage from './pages/LessonPage'
import ProtectedRoute from './components/routing/ProtectedRoute'
import PublicRoute from './components/routing/PublicRoute'
import AppShell from './AppShell'

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

const soon = (title, description) => (
  <Protected>
    <ComingSoon title={title} description={description} />
  </Protected>
)

export default function App() {
  return (
    <AppShell>
      <Routes>
        {/* Default landing */}
        <Route path="/" element={<Navigate to="/explore" replace />} />

        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* Built destinations */}
        <Route
          path="/explore"
          element={
            <Protected>
              <ExplorePage />
            </Protected>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/history"
          element={
            <Protected>
              <HistoryPage />
            </Protected>
          }
        />
        <Route
          path="/practice/new"
          element={
            <Protected>
              <SetupPage />
            </Protected>
          }
        />
        <Route
          path="/practice/session"
          element={
            <Protected>
              <QuestionPage />
            </Protected>
          }
        />
        <Route
          path="/practice/feedback"
          element={
            <Protected>
              <FeedbackPage />
            </Protected>
          }
        />

        {/* Legacy path aliases */}
        <Route path="/setup" element={<Navigate to="/practice/new" replace />} />
        <Route path="/question" element={<Navigate to="/practice/session" replace />} />
        <Route path="/feedback" element={<Navigate to="/practice/feedback" replace />} />

        {/* Wired but not yet built */}
        <Route
          path="/learning"
          element={soon('My Learning', 'Your enrolled courses and progress will live here.')}
        />
        <Route
          path="/interview"
          element={soon('Interview Prep', 'Timed mock interviews tailored to your weak areas.')}
        />
        <Route
          path="/analytics"
          element={soon('Analytics', 'Deeper insight into your mastery over time.')}
        />
        <Route
          path="/weak-areas"
          element={soon('Weak Areas', 'Topics that need attention, ranked by mastery.')}
        />
        <Route path="/notes" element={soon('My Notes', 'Your saved notes and highlights.')} />
        <Route path="/settings" element={soon('Settings', 'Account, theme and study preferences.')} />
        <Route
          path="/course/:id"
          element={soon('Course', 'Course details and the topic list.')}
        />
        <Route
          path="/learn/:courseId/:topicId/:lessonId"
          element={
            <Protected>
              <LessonPage />
            </Protected>
          }
        />
        <Route
          path="/map/:courseId/:topicId"
          element={soon('Knowledge graph', 'A visual map of how this topic connects.')}
        />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}
