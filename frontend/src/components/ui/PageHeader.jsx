/**
 * PageHeader — consistent page title block used across screens.
 */

import React from 'react'
import { cx } from '../../lib/cx'

export function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cx('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export default PageHeader
