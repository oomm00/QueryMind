/**
 * App — Root router with ProtectedRoute/PublicRoute and new AppShell layout.
 * Routes are protected; unauthed users go to /login.
 * Authenticated users see the new shell (top bar + left rail / bottom tab bar).
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import QuestionPage from './pages/QuestionPage'
import FeedbackPage from './pages/FeedbackPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import NotFoundPage from './pages/NotFoundPage'
import ProtectedRoute from './components/routing/ProtectedRoute'
import PublicRoute from './components/routing/PublicRoute'
import AppShell from './AppShell'

function AppLayout({ children }) {
  return (
    <div className="pt-0">
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top‑bar search/ theme stub (moved to AppShell but kept here for standalone)
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <AppShell>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/setup" replace />} />

        {/* Public route — login accessible when logged out */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* Protected routes — require authentication */}
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SetupPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/question"
          element={
            <ProtectedRoute>
              <AppLayout>
                <QuestionPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <AppLayout>
                <FeedbackPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HistoryPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* 404 catch‑all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}