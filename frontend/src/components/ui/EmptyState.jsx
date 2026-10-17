/**
 * EmptyState — shown when there is no content. `icon` may be an icon component
 * (from Icons.jsx) or a rendered node.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { Button } from './Button'

function renderIcon(icon) {
  if (!icon) return null
  if (typeof icon === 'function') return React.createElement(icon, { size: 22 })
  return icon
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  secondaryLabel,
  onSecondaryAction,
  className,
  ...rest
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
      {...rest}
    >
      {icon && (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-panel bg-primary-tint text-primary">
          {renderIcon(icon)}
        </span>
      )}
      {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {(action || actionLabel) && (
        <div className="mt-1 flex items-center gap-2">
          {action || (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && (
            <Button size="sm" variant="ghost" onClick={onSecondaryAction}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default EmptyState
