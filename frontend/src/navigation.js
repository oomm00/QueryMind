/**
 * Navigation model — single source of truth for the rail, mobile tabs,
 * breadcrumbs and the command palette.
 */

import {
  IconDashboard,
  IconExplore,
  IconLearning,
  IconInterview,
  IconAnalytics,
  IconWeakAreas,
  IconNotes,
  IconSettings,
} from './components/ui/Icons'

export const WORKSPACE_LABEL = 'Your workspace'

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard },
  { to: '/explore', label: 'Explore', icon: IconExplore },
  { to: '/learning', label: 'My courses', icon: IconLearning },
  { to: '/interview', label: 'Interview Prep', icon: IconInterview },
  { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
  { to: '/weak-areas', label: 'Weak Areas', icon: IconWeakAreas, badgeKey: 'weakAreas' },
  { to: '/notes', label: 'My Notes', icon: IconNotes },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

// Bottom tab bar shows the first five primary destinations; the rest live
// behind "More".
export const MOBILE_TAB_PATHS = ['/dashboard', '/explore', '/learning', '/interview', '/analytics']

export const MOBILE_TABS = NAV_ITEMS.filter((item) => MOBILE_TAB_PATHS.includes(item.to))
export const MOBILE_MORE_ITEMS = NAV_ITEMS.filter((item) => !MOBILE_TAB_PATHS.includes(item.to))

const SEGMENT_LABELS = {
  dashboard: 'Dashboard',
  explore: 'Explore',
  learning: 'My courses',
  interview: 'Interview Prep',
  analytics: 'Analytics',
  'weak-areas': 'Weak Areas',
  notes: 'My Notes',
  settings: 'Settings',
  course: 'Course',
  learn: 'Written lesson',
  map: 'Knowledge graph',
  practice: 'Practice',
  new: 'New',
  session: 'Session',
  feedback: 'Feedback',
  history: 'History',
  login: 'Sign in',
}

/**
 * breadcrumbFor('/practice/new') -> [{label:'Workspace', to:'/dashboard'}, {label:'Practice', to:'/practice'}, {label:'New'}]
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
