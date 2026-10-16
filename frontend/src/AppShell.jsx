/**
 * AppShell — application layout chrome.
 * Top bar (brand, theme toggle, account) plus a responsive nav:
 * a left rail on desktop and a bottom tab bar on mobile.
 * It renders the routed page tree passed in as `children`.
 */

import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

const NAV_LINKS = [
  { to: '/setup', label: 'Setup' },
  { to: '/question', label: 'Practice' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/history', label: 'History' },
]

function navClass(isActive, extra = '') {
  const base = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors'
  const state = isActive
    ? 'bg-moss text-white'
    : 'text-muted hover:text-moss hover:bg-surface/60'
  return `${base} ${state} ${extra}`.trim()
}

export default function AppShell({ children }) {
  const [theme, setTheme] = useState('light')
  const { user, logout, isAuthenticated } = useAuth()

  // Apply the chosen theme to <html> (index.css keys off [data-theme]).
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      {/* Top bar */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <span className="text-xl font-display font-semibold text-ink">QueryMind</span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {isAuthenticated && (
              <>
                <span className="hidden sm:inline text-sm text-muted">
                  {user?.email || 'User'}
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Desktop left rail */}
          {isAuthenticated && (
            <nav className="hidden md:block w-48 flex-shrink-0">
              <ul className="space-y-1 sticky top-6">
                {NAV_LINKS.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} className={({ isActive }) => navClass(isActive)}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Routed content */}
          <main className="flex-1 min-w-0">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      {isAuthenticated && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-line bg-surface z-50">
          <div className="flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  navClass(isActive, 'flex-1 justify-center rounded-none')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
