/**
 * ProtectedRoute Component
 * Restricts access to authenticated users. If authentication is loading,
 * shows a minimal loading state. If unauthenticated, redirects to /login.
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
        <div className="text-center animate-pulse-soft">
          <div className="text-3xl mb-3">🧠</div>
          <p className="text-xs font-mono uppercase tracking-widest">Checking session…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}