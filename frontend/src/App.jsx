/**
 * App — Root Router
 * Configured with ProtectedRoute, PublicRoute, Navbar, and 404 handler.
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import QuestionPage from './pages/QuestionPage.jsx'
import FeedbackPage from './pages/FeedbackPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import ProtectedRoute from './components/routing/ProtectedRoute.jsx'
import PublicRoute from './components/routing/PublicRoute.jsx'
import Navbar from './components/common/Navbar.jsx'

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Root redirect to setup (protected route will handle redirect to login if unauthed) */}
      <Route path="/" element={<Navigate to="/setup" replace />} />

      {/* Public routes (inaccessible if already logged in) */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
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

      {/* 404 Catch-All Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
