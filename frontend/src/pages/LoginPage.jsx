/**
 * LoginPage — /login
 * Authenticates user credentials or registers a new account using AuthContext.
 * Bounded to real backend auth by default, or mock auth if VITE_MOCK_AUTH=true.
 */

import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

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
    <div className="min-h-screen flex items-center justify-center py-8 bg-[var(--bg)]">
      <div className="w-full max-w-md animate-slide-up bg-white rounded-md p-8 shadow-sm">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-[var(--surface)] shadow-sm mb-3">
            <span className="text-2xl">QM</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-[var(--ink)] tracking-tight">QueryMind</h1>
          <p className="text-[var(--muted)] mt-1 text-sm">
            AI-powered adaptive learning & cognitive evaluation
          </p>
        </div>

        {/* Auth Card */}
        <div className="panel lg:panel-lg mt-6">
          {/* Tab Switcher */}
          <div className="flex rounded-md overflow-hidden mb-4">
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
                    ? 'bg-[var(--moss)] text-white shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--moss)]'`
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label htmlFor="full_name" className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                  Full Name
                </label>
                <Input
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
              <label htmlFor="email" className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <Input
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
              <label htmlFor="password" className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <Input
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
              <div className="mt-2 p-3 rounded-md bg-[var(--rust)/10] border border-[var(--rust)]/50">
                {error}
              </div>
            )}

            <Button
              id="btn-submit-auth"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2"
            >
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}