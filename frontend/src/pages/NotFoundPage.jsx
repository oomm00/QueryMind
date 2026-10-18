/**
 * NotFoundPage — 404
 * Renders as a centered card inside the app shell page area.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '../components/ui/Panel'
import { buttonClasses } from '../components/ui/Button'
import { IconSearch, IconArrowRight } from '../components/ui/Icons'

export default function NotFoundPage() {
  return (
    <div className="flex items-center justify-center py-12">
      <Panel className="w-full max-w-md p-8 text-center">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-panel bg-primary-tint text-primary">
          <IconSearch size={24} />
        </span>

        <p className="mt-4 font-mono text-5xl font-semibold text-primary">404</p>

        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">Page not found</h1>

        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          The page you are looking for does not exist or has been moved.
        </p>

        <Link
          to="/explore"
          className={buttonClasses({ variant: 'primary', className: 'mt-6 w-full' })}
        >
          <IconArrowRight size={16} />
          Go to Explore
        </Link>
      </Panel>
    </div>
  )
}
