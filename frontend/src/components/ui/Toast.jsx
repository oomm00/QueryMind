/**
 * Toast — transient notification at top-right.
 * Renders as a component; auto-hides after `duration` and then calls `onClose`.
 */

import React from 'react'

export function Toast({ title, description, variant = 'default', duration = 4000, onClose, ...rest }) {
  const [visible, setVisible] = React.useState(true)

  // Keep the latest onClose without resetting the timer on every render.
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  })

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onCloseRef.current?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [duration])

  return (
    <div
      className={`toast ${variant} ${visible ? 'visible' : ''}`}
      role="status"
      {...rest}
    >
      <div className="flex items-start gap-3">
        {variant === 'error' && (
          <svg
            className="shrink-0 w-4 h-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-label="Error"
          >
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{title}</p>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      </div>
    </div>
  )
}

export default Toast
