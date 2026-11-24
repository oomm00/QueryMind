/**
 * SettingsPage — /settings
 *
 * Requirements:
 * - Keep only real items (logout, theme indicator, display name / email if API supports it).
 * - No stubs, no fake options, no "Coming soon".
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api/client.js'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { PanelLarge } from '../components/ui/Panel.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { IconSettings, IconClock } from '../components/ui/Icons.jsx'
import { formatWhen } from '../lib/text.js'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, userId, logout } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Settings' }])

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch('/auth/me')
      .then((data) => {
        if (active) setProfile(data)
      })
      .catch(() => {
        // Fall back to auth context info
        if (active) {
          setProfile({
            user_id: userId,
            email: user?.email,
            full_name: user?.full_name || user?.name,
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId, user])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  const email = profile?.email || user?.email || 'authenticated user'
  const name = profile?.full_name || user?.full_name || 'Learner'
  const id = profile?.user_id || userId || 'unknown'
  const memberSince = profile?.created_at ? formatWhen(profile.created_at) : 'Active session'

  return (
    <div className="space-y-5" data-testid="settings-page">
      <PageHeader
        title="Settings"
        description="Manage your account profile, interface preferences, and active session."
      />

      {/* Account Info */}
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Account Profile</h2>
        <p className="mt-0.5 text-xs text-muted">
          Your credentials and identity on this QueryMind instance.
        </p>

        <div className="mt-4 divide-y divide-line text-xs">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted">Display Name</span>
            <span className="font-medium text-ink">{name}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted">Email</span>
            <span className="font-mono text-ink">{email}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted">User ID</span>
            <span className="font-mono text-muted text-[11px] truncate max-w-[200px] sm:max-w-none">
              {id}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted">Account Status</span>
            <Badge variant="success" label="Active" />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-muted">Member Since</span>
            <span className="text-ink flex items-center gap-1.5">
              <IconClock size={13} className="text-muted" />
              {memberSince}
            </span>
          </div>
        </div>
      </PanelLarge>

      {/* Appearance */}
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Appearance & Theme</h2>
        <p className="mt-0.5 text-xs text-muted">
          Design system settings applied across all views.
        </p>

        <div className="mt-4 flex items-center justify-between text-xs py-1">
          <div>
            <p className="font-medium text-ink">Interface Theme</p>
            <p className="text-muted">High-contrast dark theme optimized for technical review & projectors.</p>
          </div>
          <Badge variant="primary" label="Restrained Dark" />
        </div>
      </PanelLarge>

      {/* Session Actions */}
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Session Management</h2>
        <p className="mt-0.5 text-xs text-muted">
          Sign out of this session on this browser.
        </p>

        <div className="mt-4">
          <Button variant="danger" size="md" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </PanelLarge>
    </div>
  )
}
