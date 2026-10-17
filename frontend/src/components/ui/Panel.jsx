/**
 * Panel — flat surface with a 1px border and 12px radius.
 * PanelLarge / PanelSmall vary the padding by role.
 */

import React from 'react'
import { cx } from '../../lib/cx'

export function Panel({ className, children, ...rest }) {
  return (
    <div
      className={cx('rounded-panel border border-line bg-surface', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function PanelLarge({ className, children, ...rest }) {
  return (
    <div
      className={cx('rounded-panel border border-line bg-surface p-6', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function PanelSmall({ className, children, ...rest }) {
  return (
    <div
      className={cx('rounded-panel border border-line bg-surface p-3.5', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export default Panel
