/**
 * Dialog — a small modal for the few decisions that need one (enrolling, or
 * confirming a destructive action). Closes on Escape and on the backdrop, and
 * holds focus on open.
 */

import React, { useEffect, useRef } from 'react'

export function Dialog({ open, title, description, onClose, children, footer, className }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full max-w-md rounded-panel border border-line bg-surface p-5 shadow-pop ${className ?? ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export default Dialog
