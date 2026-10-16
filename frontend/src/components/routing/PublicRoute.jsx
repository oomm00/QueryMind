/**
 * PublicRoute Component
 * Prevents authenticated users from seeing the login/register page by redirecting to /setup.
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
        <div className="text-center animate-pulse-soft">
          <div className="text-3xl mb-3">🧠</div>
          <p className="text-xs font-mono uppercase tracking-widest">Loading…</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/setup" replace />
  }

  return children
}