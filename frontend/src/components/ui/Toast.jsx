/**
 * Toast — transient notification. Renders as a component, auto-hides after
 * `duration`, then calls `onClose` (typically to unmount it from the parent).
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { IconClose, IconInfo, IconCheck, IconAlert } from './Icons'

const TONES = {
  default: { accent: 'text-primary', Icon: IconInfo },
  primary: { accent: 'text-primary', Icon: IconInfo },
  info: { accent: 'text-primary', Icon: IconInfo },
  success: { accent: 'text-success', Icon: IconCheck },
  warning: { accent: 'text-warning', Icon: IconAlert },
  danger: { accent: 'text-danger', Icon: IconAlert },
  error: { accent: 'text-danger', Icon: IconAlert },
}

export function Toast({ title, description, variant = 'default', duration = 4000, onClose, className, ...rest }) {
  const [visible, setVisible] = React.useState(true)
  const tone = TONES[variant] || TONES.default
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
      role="status"
      aria-live="polite"
      className={cx(
        'fixed right-4 top-4 z-[60] w-[min(360px,calc(100vw-2rem))] rounded-panel border border-line bg-surface p-3.5 shadow-pop',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 shrink-0', tone.accent)}>
          <tone.Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss notification"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <IconClose size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default Toast
