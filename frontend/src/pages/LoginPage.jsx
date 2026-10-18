/**
 * LoginPage — /login
 * Authenticates user credentials or registers a new account using AuthContext.
 * Bounded to real backend auth by default, or mock auth if VITE_MOCK_AUTH=true.
 * Renders without the app shell, so it is a full-screen centered card.
 */

import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { PanelLarge } from '../components/ui/Panel'
import { Tabs } from '../components/ui/Tabs'
import { ErrorState } from '../components/ui/ErrorState'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register } = useAuth()

  const [tab, setTab] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const from = location.state?.from?.pathname || '/explore'

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
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-md">
        {/* Brand mark + wordmark */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-2xl font-semibold text-primary-fg">
            q
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">QueryMind</h1>
          <p className="mt-1 text-sm text-muted">
            AI-powered adaptive learning &amp; cognitive evaluation
          </p>
        </div>

        {/* Auth card */}
        <PanelLarge>
          <Tabs
            className="mb-5"
            tabs={[
              { label: 'Sign in', value: 'login' },
              { label: 'Create account', value: 'register' },
            ]}
            value={tab}
            onChange={(value) => {
              setTab(value)
              setError(null)
            }}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <Input
                id="full_name"
                name="full_name"
                type="text"
                label="Full name"
                placeholder="Ada Lovelace"
                value={form.full_name}
                onChange={handleChange}
              />
            )}

            <Input
              id="email"
              name="email"
              type="email"
              label="Email address"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />

            <Input
              id="password"
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
            />

            {error && <ErrorState title="Authentication failed" message={error} />}

            <Button
              id="btn-submit-auth"
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
            >
              {tab === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </PanelLarge>
      </div>
    </div>
  )
}
