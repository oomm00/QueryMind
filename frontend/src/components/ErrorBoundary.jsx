/**
 * ErrorBoundary — catches runtime errors in the child component tree.
 * Shows a readable fallback with a "Reload" button.
 */

import React, { Component } from 'react'

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
    return (
      <div className="error-state text-center py-8">
        <h3 className="text-2xl font-semibold text-rust mb-2">Something went wrong</h3>
        <p className="text-muted mb-4">An unexpected error occurred.</p>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => window.location.reload()}
          aria-label="Reload page"
        >
          Reload
        </button>
      </div>
    )
  }
}

ErrorBoundary.displayName = 'ErrorBoundary'

export default ErrorBoundary
