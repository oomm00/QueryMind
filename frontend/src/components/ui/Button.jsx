/**
 * Button — primary, quiet, danger; loading state.
 * Flat fill, 1px border, no heavy shadows, plain verbs, no trailing arrows.
 */

import React from 'react'

export function Button({ variant = 'primary', children, loading = false, className, onClick, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium text-sm'

  const variantClasses = {
    primary: 'bg-moss text-white hover:bg-moss/90',
    quiet: 'border border-line bg-surface/50 text-ink hover:bg-surface/60 hover:text-moss',
    danger: 'bg-rust text-white hover:bg-rust/90',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[base, variantClasses[variant], className].filter(Boolean).join(' ') + ' disabled:opacity-50 disabled:cursor-not-allowed'}
      disabled={loading}
      {...rest}
    >
      {loading ? (
        <span className="animate-spin h-4 w-4 border-2 border-white opacity-75 rounded-full"></span>
      ) : null}
      <span>{children}</span>
    </button>
  )
}