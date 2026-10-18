/**
 * ProtectedRoute Component
 * Restricts access to authenticated users. If authentication is loading,
 * shows a minimal loading state. If unauthenticated, redirects to /login.
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import RouteLoading from './RouteLoading'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <RouteLoading label="Checking session…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}