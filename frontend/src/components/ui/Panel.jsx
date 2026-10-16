/**
 * Panel — replaces .card; varies padding and radius by role.
 * Flat fill, 1px border, no heavy shadows.
 */

import React from 'react'

export function Panel({ className, children, ...rest }) {
  return (
    <div className={`panel ${className || ''}`} {...rest}>
      {children}
    </div>
  )
}

export function PanelLarge({ className, children, ...rest }) {
  return (
    <div className={`panel panel-lg ${className || ''}`} {...rest}>
      {children}
    </div>
  )
}

export function PanelSmall({ className, children, ...rest }) {
  return (
    <div className={`panel panel-sm ${className || ''}`} {...rest}>
      {children}
    </div>
  )
}

export default Panel
