/**
 * CourseTabs — the four destinations of a course, each with its own route.
 *
 * They are links, not local state, so a tab can be bookmarked, refreshed and
 * shared, and the back button moves between them like any other page.
 */

import React from 'react'
import { NavLink } from 'react-router-dom'
import { cx } from '../../lib/cx'

const TABS = [
  { segment: '', label: 'Practice' },
  { segment: 'material', label: 'Study material' },
  { segment: 'progress', label: 'Progress' },
  { segment: 'about', label: 'About' },
]

export function CourseTabs({ courseId, className }) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cx('flex items-center gap-1 overflow-x-auto border-b border-line no-scrollbar', className)}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={`/course/${courseId}${tab.segment ? `/${tab.segment}` : ''}`}
          end={tab.segment === ''}
          role="tab"
          className={({ isActive }) =>
            cx(
              'relative -mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors duration-150',
              isActive
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:text-ink'
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}

export default CourseTabs
