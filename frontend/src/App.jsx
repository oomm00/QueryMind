/**
 * App — root router.
 *
 * Public:  /login
 * Default: /explore (redirect target after sign-in)
 * Built:   /dashboard, /explore, /courses, /practice, /practice/:sessionId,
 *          /practice/:sessionId/results, /history, /notes,
 *          /course/:id (overview, material, progress, about),
 *          /learn/:courseId/:topicId/:lessonId,
 *          /map/:courseId/:topicId (topic knowledge graph)
 * Moved:   /generate and /upload redirected - the generate form is the
 *          "Pick a topic" tab on /practice, upload is the Documents tab on /notes.
 * Remaining placeholders: course/catalog data and a few preference endpoints
 * still use the local demo content until matching backend routes are added.
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
import NotesPage from './pages/NotesPage'
import NotFoundPage from './pages/NotFoundPage'
import ComingSoon from './pages/ComingSoon'
import LessonPage from './pages/LessonPage'
import MapPage from './pages/MapPage'
import AnalyticsPage from './pages/AnalyticsPage'
import WeakAreasPage from './pages/WeakAreasPage'
import InterviewPrepPage from './pages/InterviewPrepPage'
import SettingsPage from './pages/SettingsPage'
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
        {/* Moved: the form lives on /practice as "Pick a topic", the upload page
            on /notes as "Documents". Old links and bookmarks still land. */}
        <Route path="/generate" element={<Navigate to="/practice" replace />} />
        <Route path="/upload" element={<Navigate to="/notes" replace />} />
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

        {/* Workspace destinations */}
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
          element={
            <Protected>
              <InterviewPrepPage />
            </Protected>
          }
        />
        <Route
          path="/analytics"
          element={
            <Protected>
              <AnalyticsPage />
            </Protected>
          }
        />
        <Route
          path="/weak-areas"
          element={
            <Protected>
              <WeakAreasPage />
            </Protected>
          }
        />
        <Route path="/notes" element={<Protected><NotesPage /></Protected>} />
        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />
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
