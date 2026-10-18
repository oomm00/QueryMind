/**
 * Button — primary, secondary, ghost and danger variants with a loading state.
 * Flat fill, 1px border, 8px radius. `buttonClasses` is exported so <Link> and
 * other elements can reuse the exact same styling.
 */

import React from 'react'
import { cx } from '../../lib/cx'

const VARIANTS = {
  primary: 'bg-primary text-primary-fg border border-transparent hover:brightness-105',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-raised',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface-raised',
  danger: 'bg-danger text-primary-fg border border-transparent hover:brightness-105',
  // Back-compat aliases
  quiet: 'bg-surface text-ink border border-line hover:bg-surface-raised',
  accent: 'bg-primary text-primary-fg border border-transparent hover:brightness-105',
}

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
}

export function buttonClasses({ variant = 'primary', size = 'md', className } = {}) {
  return cx(
    'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap',
    'transition-[background-color,color,filter,opacity] duration-150',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    SIZES[size] || SIZES.md,
    VARIANTS[variant] || VARIANTS.primary,
    className
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon = null,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className: cx(fullWidth && 'w-full', className) })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}

export default Button
