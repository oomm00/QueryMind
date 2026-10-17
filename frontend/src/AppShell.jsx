/**
 * AppShell — application chrome: a collapsible left rail (desktop) that becomes
 * a bottom tab bar (mobile), a top bar with breadcrumbs, command-palette search,
 * notifications and an account menu.
 *
 * It is layout-only: it renders the routed page tree passed in as `children`.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { CommandPalette } from './components/CommandPalette'
import { useTheme } from './hooks/useTheme'
import { useRailStats } from './hooks/useRailStats'
import { NAV_ITEMS, MOBILE_TABS, MOBILE_MORE_ITEMS, WORKSPACE_LABEL, breadcrumbFor } from './navigation'
import { BreadcrumbProvider, BreadcrumbContext } from './hooks/useBreadcrumbs'
import { Tooltip } from './components/ui/Tooltip'
import { ProgressLine } from './components/ui/ProgressLine'
import { ProgressRing } from './components/ui/ProgressRing'
import {
  IconSearch,
  IconBell,
  IconChevronLeft,
  IconSun,
  IconMoon,
  IconLogout,
  IconMore,
  IconTarget,
} from './components/ui/Icons'
import { cx } from './lib/cx'

const RAIL_KEY = 'qm-rail-collapsed'

const ICON_BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const MENU_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

/** "320" -> "3h 20m", "45" -> "45m", "300" -> "5h". */
export function formatHours(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function initialsOf(user) {
  const source = user?.full_name || user?.name || user?.email || ''
  if (!source) return 'Q'
  const base = source.includes('@') ? source.split('@')[0] : source
  const parts = base.split(/[.\s_-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)
  return letters.toUpperCase()
}

function RailItem({ item, collapsed, badge }) {
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cx(
          'group flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          isActive
            ? 'bg-primary-tint text-primary'
            : 'text-muted hover:bg-surface-raised hover:text-ink'
        )
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">
          {badge}
        </span>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip label={item.label} side="right">
      {link}
    </Tooltip>
  )
}

function MobileTab({ item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cx(
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
          isActive ? 'text-primary' : 'text-muted'
        )
      }
    >
      <Icon size={19} />
      <span className="truncate px-0.5">{item.label}</span>
    </NavLink>
  )
}

/**
 * Top-bar breadcrumbs. The routed page declares its own trail via
 * useBreadcrumbs(); if it did not, we fall back to the route-derived crumbs.
 */
function Breadcrumbs({ pathname }) {
  const ctx = React.useContext(BreadcrumbContext)
  const declared = ctx?.crumbs
  const crumbs = declared?.length ? declared : breadcrumbFor(pathname)
  const last = crumbs[crumbs.length - 1]

  return (
    <>
      <span className="truncate text-sm font-medium text-ink md:hidden">{last?.label}</span>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {crumbs.map((crumb, index) => (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <span className="text-muted">/</span>}
            {crumb.to ? (
              <Link to={crumb.to} className="truncate text-muted transition-colors hover:text-ink">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-ink">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    </>
  )
}

export default function AppShellRoot({ children }) {
  return (
    <BreadcrumbProvider>
      <AppShell>{children}</AppShell>
    </BreadcrumbProvider>
  )
}

function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { weakAreaCount, weekly } = useRailStats()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1'
    } catch {
      return false
    }
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // Global ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Dismiss the account menu on outside click.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  // Close the mobile "More" sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  const bare = location.pathname.startsWith('/login') || !isAuthenticated
  if (bare) {
    return <div className="min-h-screen bg-page text-ink">{children}</div>
  }

  const goalMinutes = weekly.minutes
  const goalTarget = weekly.targetMinutes
  const goalPct = Math.min(100, (goalMinutes / goalTarget) * 100)

  return (
    <div className="min-h-screen bg-page text-ink" style={{ '--rail-w': collapsed ? '72px' : '232px' }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-control focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>

      {/* ── Left rail (desktop) ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex">
        <div
          className={cx(
            'flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4',
            collapsed && 'justify-center px-0'
          )}
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-[15px] font-semibold text-primary-fg">
            q
          </span>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight text-ink">QueryMind</span>
          )}
        </div>

        <nav aria-label="Primary" className="qm-scroll flex-1 overflow-y-auto px-3 py-4">
          {!collapsed && (
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {WORKSPACE_LABEL}
            </p>
          )}
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <RailItem
                  item={item}
                  collapsed={collapsed}
                  badge={item.badgeKey === 'weakAreas' ? weakAreaCount : 0}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          {collapsed ? (
            <div className="flex justify-center py-1">
              <Tooltip label={`Weekly goal ${formatHours(goalMinutes)} of ${formatHours(goalTarget)}`} side="right">
                <ProgressRing value={goalPct} size={34} stroke={4} showValue={false} />
              </Tooltip>
            </div>
          ) : (
            <div className="rounded-panel border border-line bg-surface-raised p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <IconTarget size={13} />
                Weekly goal
              </div>
              <p className="mt-1.5 text-sm font-semibold text-ink">
                {formatHours(goalMinutes)} <span className="font-normal text-muted">/ {formatHours(goalTarget)}</span>
              </p>
              <ProgressLine className="mt-2" percentage={goalPct} />
              <p className="mt-2 text-[11px] leading-tight text-muted">A little every day adds up.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cx(
              'mt-2 flex h-9 w-full items-center gap-2 rounded-control px-3 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              collapsed && 'justify-center px-0'
            )}
          >
            <IconChevronLeft
              size={16}
              className={cx('transition-transform duration-200', collapsed && 'rotate-180')}
            />
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="md:pl-[var(--rail-w)]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-[var(--header-bg)] px-4 backdrop-blur sm:px-6">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary text-sm font-semibold text-primary-fg md:hidden">
            q
          </span>

          <Breadcrumbs pathname={location.pathname} />

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 items-center gap-2 rounded-control border border-line bg-surface-raised px-3 text-sm text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex"
            >
              <IconSearch size={16} />
              <span className="w-28 text-left">Search anything</span>
              <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className={cx(ICON_BTN, 'sm:hidden')}
            >
              <IconSearch size={18} />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={ICON_BTN}
            >
              {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>

            <button type="button" aria-label="Notifications" className={cx(ICON_BTN, 'relative')}>
              <IconBell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-tint text-xs font-semibold text-primary transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {initialsOf(user)}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 animate-fade-in overflow-hidden rounded-panel border border-line bg-surface shadow-pop"
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-ink">
                      {user?.full_name || user?.email || 'Signed in'}
                    </p>
                    {user?.email && <p className="truncate text-xs text-muted">{user.email}</p>}
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      role="menuitem"
                      className={MENU_ITEM}
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/settings')
                      }}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={MENU_ITEM}
                      onClick={() => {
                        setMenuOpen(false)
                        toggleTheme()
                      }}
                    >
                      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={cx(MENU_ITEM, 'text-danger')}
                      onClick={() => {
                        setMenuOpen(false)
                        logout()
                      }}
                    >
                      <IconLogout size={15} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="max-w-[1200px] p-6 pb-24 md:pb-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* ── Bottom tab bar (mobile) ─────────────────────────── */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden"
      >
        <div className="flex">
          {MOBILE_TABS.map((item) => (
            <MobileTab key={item.to} item={item} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted"
          >
            <IconMore size={19} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[var(--overlay)] md:hidden"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="More destinations"
            className="w-full animate-slide-up rounded-t-panel border-t border-line bg-surface p-3 pb-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <ul className="grid grid-cols-4 gap-1">
              {MOBILE_MORE_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className="flex flex-col items-center gap-1.5 rounded-control p-3 text-center text-xs text-ink transition-colors hover:bg-surface-raised"
                    >
                      <Icon size={20} className="text-muted" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
