/**
 * SidePanel — a single element that is a static sticky column from lg upwards
 * and a drawer below it.
 *
 * Rendering one element instead of two avoids duplicating the panel's state
 * (filter text, expanded rows) across a desktop copy and a drawer copy.
 *
 * `open` means "expanded column" at lg+, and "drawer visible" below lg. The
 * caller supplies the lg width (e.g. `lg:w-[208px] xl:w-[248px]`); this
 * component only fixes the drawer width.
 */

import React, { useEffect } from 'react'
import { cx } from '../../lib/cx'
import { IconClose } from '../ui/Icons'

export function SidePanel({ open, onClose, side = 'left', label, className, children }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop, drawers only. Sits above the shell chrome (rail/tab bar, z-40). */}
      <div
        className="fixed inset-0 z-50 bg-overlay lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label={label}
        className={cx(
          'fixed inset-y-0 z-[60] flex w-[280px] flex-col overflow-y-auto bg-surface',
          'lg:sticky lg:inset-auto lg:top-20 lg:z-auto lg:max-h-[calc(100vh-6rem)] lg:shrink-0',
          side === 'left' ? 'left-0 border-r border-line' : 'right-0 border-l border-line',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <IconClose size={16} />
          </button>
        </div>

        {children}
      </aside>
    </>
  )
}

export default SidePanel
