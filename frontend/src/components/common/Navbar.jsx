/**
 * Main Application Navbar
 * Includes links to Setup, Dashboard, History (placeholder), and Logout.
 */

import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuth()

  if (!isAuthenticated) return null

  const navLinks = [
    { path: '/setup', label: 'Setup', icon: '⚙️' },
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/history', label: 'History', icon: '🕒', badge: 'Soon' },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-surface-border bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link to="/setup" className="flex items-center gap-2.5 font-display font-bold text-lg text-white hover:opacity-90 transition-opacity">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-brand text-sm">
              🧠
            </span>
            <span>QueryMind</span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <span className="text-xs">{link.icon}</span>
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-full font-mono">
                      {link.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          {user?.email && (
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-medium text-zinc-200">
                {user.full_name || user.email.split('@')[0]}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                {user.email}
              </span>
            </div>
          )}

          <button
            id="btn-nav-logout"
            onClick={handleLogout}
            className="btn-ghost text-xs px-3 py-1.5"
            title="Sign out of your session"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  )
}
