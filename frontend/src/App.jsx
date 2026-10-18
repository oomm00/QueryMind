/**
 * App — root router.
 *
 * Public:  /login
 * Default: /explore (redirect target after sign-in)
 * Built:   /dashboard, /explore, /courses, /practice, /practice/:sessionId,
 *          /practice/:sessionId/results, /history, /upload, /generate,
 *          /course/:id (overview, material, progress, about),
 *          /learn/:courseId/:topicId/:lessonId,
 *          /map/:courseId/:topicId (topic knowledge graph)
 * Stubs:   everything else renders <ComingSoon/>.
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SessionPage from './pages/SessionPage'
import ResultsPage from './pages/ResultsPage'
import MyCoursesPage from './pages/MyCoursesPage'
import PracticeHomePage from './pages/PracticeHomePage'
import DashboardPage from './pages/DashboardPage'
import ExplorePage from './pages/ExplorePage'
import HistoryPage from './pages/HistoryPage'
import UploadDocumentsPage from './pages/UploadDocumentsPage'
import GenerateQuestionsPage from './pages/GenerateQuestionsPage'
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
          path="/upload"
          element={
            <Protected>
              <UploadDocumentsPage />
            </Protected>
          }
        />
        <Route
          path="/generate"
          element={
            <Protected>
              <GenerateQuestionsPage />
            </Protected>
          }
        />
        <Route
          path="/practice"
          element={
            <Protected>
              <PracticeHomePage />
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

        {/* Legacy path alias */}
        <Route path="/learning" element={<Navigate to="/courses" replace />} />

        {/* Wired but not yet built */}
        <Route
          path="/courses"
          element={
            <Protected>
              <MyCoursesPage />
            </Protected>
          }
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
