/**
 * LoginPage — /login
 * Stub: submits credentials to the backend /auth/login endpoint
 * and stores the returned token in localStorage.
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../api/client.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')          // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (tab === 'register') {
        await authApi.register({ email: form.email, password: form.password, full_name: form.full_name })
        setTab('login')
        return
      }

      const data = await authApi.login({ email: form.email, password: form.password })
      localStorage.setItem('qm_token', data.access_token)
      localStorage.setItem('qm_user_id', data.user_id)
      navigate('/setup')
    } catch (err) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-brand mb-4">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white">QueryMind</h1>
          <p className="text-[var(--color-muted)] mt-1 text-sm">
            AI-powered adaptive learning
          </p>
        </div>

        {/* Card */}
        <div className="card">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-surface-border mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors duration-200 ${
                  tab === t
                    ? 'bg-brand-500 text-white'
                    : 'text-[var(--color-muted)] hover:text-white'
                }`}
              >
                {t}
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
              <label htmlFor="email" className="label">Email</label>
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
              <p className="text-red-400 text-sm bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              id="btn-submit-auth"
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--color-muted)] mt-6">
            This is a development stub.{' '}
            <button
              id="btn-skip-login"
              onClick={() => navigate('/setup')}
              className="text-brand-400 hover:underline"
            >
              Skip to Setup →
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
