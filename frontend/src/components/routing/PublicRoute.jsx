/**
 * PublicRoute Component
 * Prevents authenticated users from seeing the login/register page by sending
 * them to the app's home, /explore.
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import RouteLoading from './RouteLoading'

export default function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <RouteLoading />
  }

  if (isAuthenticated) {
    return <Navigate to="/explore" replace />
  }

  return children
}