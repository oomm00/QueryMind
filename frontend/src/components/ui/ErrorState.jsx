/**
 * ErrorState — explains what happened and offers a Retry action.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { Button } from './Button'
import { IconAlert } from './Icons'

export function ErrorState({
  error,
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  className,
  ...rest
}) {
  const detail = message || (typeof error === 'string' ? error : error?.message)

  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-center gap-3 rounded-panel border border-line bg-danger-tint px-6 py-8 text-center',
        className
      )}
      {...rest}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-danger">
        <IconAlert size={20} />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {detail && <p className="mt-1 max-w-sm text-sm text-muted">{detail}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export default ErrorState
