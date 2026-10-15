/**
 * LoginPage — /login
 * Authenticates user credentials or registers a new account using AuthContext.
 * Bounded to real backend auth by default, or mock auth if VITE_MOCK_AUTH=true.
 */

import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register } = useAuth()

  const [tab, setTab] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const from = location.state?.from?.pathname || '/setup'

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (tab === 'register') {
        await register({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
        })
      } else {
        await login({
          email: form.email,
          password: form.password,
        })
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper min-h-screen items-center justify-center py-12">
      <div className="w-full max-w-md animate-slide-up">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-brand shadow-lg shadow-indigo-500/20 mb-3">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">QueryMind</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            AI-powered adaptive learning & cognitive evaluation
          </p>
        </div>

        {/* Auth Card */}
        <div className="card">
          {/* Tab Switcher */}
          <div className="flex rounded-lg overflow-hidden border border-surface-border bg-zinc-950 p-1 mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                type="button"
                onClick={() => {
                  setTab(t)
                  setError(null)
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md capitalize transition-all duration-150 ${
                  tab === t
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label htmlFor="full_name" className="label">Full Name</label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  placeholder="Ada Lovelace"
                  value={form.full_name}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                required
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
                className="input"
              />
            </div>

            {error && (
              <div className="text-rose-400 text-xs bg-rose-950/40 border border-rose-900/60 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              id="btn-submit-auth"
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
