/**
 * RouteLoading — skeleton shown while the authentication state resolves.
 * Shared by ProtectedRoute and PublicRoute so the redirect between them does
 * not flash a different placeholder. Uses the semantic page token and a
 * Skeleton, with no emoji.
 */

import React from 'react'
import { Skeleton } from '../ui/Skeleton'

export function RouteLoading({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-page px-6"
    >
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export default RouteLoading
