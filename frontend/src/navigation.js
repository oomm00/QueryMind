/**
 * Navigation model — single source of truth for the rail, mobile tabs,
 * breadcrumbs and the command palette.
 */

import {
  IconDashboard,
  IconExplore,
  IconLearning,
  IconTarget,
  IconClock,
  IconAnalytics,
  IconWeakAreas,
  IconNotes,
  IconSettings,
} from './components/ui/Icons'

export const WORKSPACE_LABEL = 'Your workspace'

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard },
  { to: '/mastery', label: 'Mastery', icon: IconTarget },
  { to: '/practice', label: 'Practice', icon: IconTarget },
  { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
  { to: '/history', label: 'History', icon: IconClock },
  { to: '/notes', label: 'My Notes', icon: IconNotes },
  { to: '/courses', label: 'Study material', icon: IconLearning },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

// Bottom tab bar shows the first five primary destinations; the rest live
// behind "More".
export const MOBILE_TAB_PATHS = ['/dashboard', '/mastery', '/practice', '/analytics', '/history']

export const MOBILE_TABS = NAV_ITEMS.filter((item) => MOBILE_TAB_PATHS.includes(item.to))
export const MOBILE_MORE_ITEMS = NAV_ITEMS.filter((item) => !MOBILE_TAB_PATHS.includes(item.to))

const SEGMENT_LABELS = {
  dashboard: 'Dashboard',
  mastery: 'Mastery',
  explore: 'Explore',
  courses: 'Study material',
  learning: 'Study material',
  analytics: 'Analytics',
  'weak-areas': 'Analytics',
  notes: 'My Notes',
  settings: 'Settings',
  course: 'Course',
  learn: 'Written lesson',
  map: 'Knowledge graph',
  practice: 'Practice',
  generate: 'Generate',
  upload: 'Upload',
  history: 'History',
  login: 'Sign in',
}

/**
 * breadcrumbFor('/practice') -> [{label:'Workspace', to:'/dashboard'}, {label:'Practice'}]
 * Every trail starts at "Workspace" so the top bar matches the Figma shell.
 */
export function breadcrumbFor(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const workspace = { label: 'Workspace', to: '/dashboard' }
  if (segments.length === 0) return [workspace, { label: 'Dashboard' }]

  const crumbs = []
  let acc = ''
  segments.forEach((segment, index) => {
    acc += `/${segment}`
    crumbs.push({
      label: SEGMENT_LABELS[segment] || decodeURIComponent(segment),
      to: index < segments.length - 1 ? acc : undefined,
    })
  })
  return [workspace, ...crumbs]
}
