/**
 * App — root router.
 *
 * Public:  /login
 * Default: /explore (redirect target after sign-in)
 * Built:   /dashboard, /history, /practice/{new,session,feedback},
 *          /course/:id (course details and the topic list),
 *          /learn/:courseId/:topicId/:lessonId,
 *          /map/:courseId/:topicId (topic knowledge graph)
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
import SessionPage from './pages/SessionPage'
import ResultsPage from './pages/ResultsPage'
import DashboardPage from './pages/DashboardPage'
import ExplorePage from './pages/ExplorePage'
import HistoryPage from './pages/HistoryPage'
import NotFoundPage from './pages/NotFoundPage'
import ComingSoon from './pages/ComingSoon'
import LessonPage from './pages/LessonPage'
import MapPage from './pages/MapPage'
import CoursePage from './pages/course/CoursePage'
import CoursePracticeTab from './pages/course/CoursePracticeTab'
import CourseMaterialTab from './pages/course/CourseMaterialTab'
import CourseProgressTab from './pages/course/CourseProgressTab'
import CourseAboutTab from './pages/course/CourseAboutTab'
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
        <Route
          path="/practice/:sessionId"
          element={
            <Protected>
              <SessionPage />
            </Protected>
          }
        />
        <Route
          path="/practice/:sessionId/results"
          element={
            <Protected>
              <ResultsPage />
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
          element={soon('My courses', 'The courses you have started, with your practice progress.')}
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
          element={
            <Protected>
              <CoursePage />
            </Protected>
          }
        >
          <Route index element={<CoursePracticeTab />} />
          <Route path="material" element={<CourseMaterialTab />} />
          <Route path="progress" element={<CourseProgressTab />} />
          <Route path="about" element={<CourseAboutTab />} />
        </Route>
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
          element={
            <Protected>
              <MapPage />
            </Protected>
          }
        />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}
