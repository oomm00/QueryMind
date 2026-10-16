/**
 * NotFoundPage — 404
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="panel text-center p-8">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-display font-bold text-[var(--ink)] mb-2">404 - Page Not Found</h1>
        <p className="text-[var(--muted)] mb-6">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/setup" className="btn-primary w-full">
          Return to Study Setup
        </Link>
      </div>
    </div>
  )
}