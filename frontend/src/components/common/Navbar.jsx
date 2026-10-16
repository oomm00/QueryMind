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
    { path: '/setup', label: 'Setup' },
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/history', label: 'History' },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-[var(--surface)/80] backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Link to="/setup" className="flex items-center gap-2 font-display font-bold text-[var(--ink)] hover:opacity-90 transition-opacity">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--surface)] text-sm">
              QM
            </span>
            <span>QueryMind</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--moss)] text-white'
                    : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]'}`}> 
                <span>{link.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}