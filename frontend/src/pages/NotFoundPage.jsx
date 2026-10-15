/**
 * NotFoundPage — 404
 */

import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page-wrapper items-center justify-center">
      <div className="card max-w-md text-center p-8 animate-slide-up">
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-2xl font-display font-bold text-white mb-2">404 - Page Not Found</h1>
        <p className="text-sm text-zinc-400 mb-6">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/setup" className="btn-primary w-full">
          Return to Study Setup
        </Link>
      </div>
    </div>
  )
}
