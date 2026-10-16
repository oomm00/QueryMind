/**
 * EmptyState — shown when there's no content to display.
 */

import React from 'react'

export function EmptyState({ icon, title, description, actionLabel, onAction, ...rest }) {
  return (
    <div className="empty-state" {...rest}>
      <div className="empty-state-icon">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="text-muted">{description}</p>
      {actionLabel && (
        <button
          type="button"
          className="btn-quiet"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}