/**
 * ErrorBoundary — catches runtime errors in the child component tree.
 * Shows a readable fallback with a "Reload" button.
 */

import React, { Component } from 'react'
import { Panel } from './ui/Panel'
import { ErrorState } from './ui/ErrorState'
import { Button } from './ui/Button'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: undefined, errorInfo: undefined }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to an external service in production.
    console.error('Error caught by ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props
      return fallback ?? this.renderFallback()
    }
    return this.props.children
  }

  renderFallback() {
    const detail = this.state.error?.message
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-page px-6 py-10">
        <Panel className="w-full max-w-md p-5">
          <ErrorState
            title="Something went wrong"
            message={detail || 'An unexpected error occurred.'}
          />
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </Panel>
      </div>
    )
  }
}

ErrorBoundary.displayName = 'ErrorBoundary'

export default ErrorBoundary
