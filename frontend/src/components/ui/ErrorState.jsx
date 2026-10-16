/**
 * ErrorState — shows what happened + Retry button.
 */

import React from 'react'

export function ErrorState({ error, retryLabel = 'Retry', onRetry, ...rest }) {
  return (
    <div className="error-state" {...rest}>
      <p className="error-state-message">{error}</p>
      <p className="error-state-hint">{retryLabel}</p>
      {onRetry && (
        <button
          type="button"
          className="btn-quiet mt-3"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}