/**
 * SettingsPage — /settings
 * User profile, application preferences, study goals, and appearance toggles.
 */

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useTheme } from '../hooks/useTheme'
import { PageHeader } from '../components/ui/PageHeader'
import { PanelLarge } from '../components/ui/Panel'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast } from '../components/ui/Toast'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Settings' }])

  const [studyGoal, setStudyGoal] = useState('5 hours / week')
  const [toast, setToast] = useState(null)

  const handleSave = (e) => {
    e.preventDefault()
    setToast({
      title: 'Settings saved',
      description: 'Your study preferences and goals have been updated.',
      variant: 'default',
    })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Settings & Preferences"
        description="Manage your account profile, study schedule goals, and interface appearance."
      />

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Account Profile</h2>
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted">
            Signed in as: <strong className="text-ink">{user?.email || 'Student User'}</strong>
          </p>
          <p className="text-muted">
            Role: <strong className="text-ink">Independent Learner</strong>
          </p>
        </div>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Appearance & Theme</h2>
        <p className="mt-0.5 text-xs text-muted">
          Current appearance mode: <strong className="capitalize text-ink">{theme}</strong>
        </p>

        <div className="mt-4">
          <Button variant="secondary" onClick={toggleTheme}>
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode
          </Button>
        </div>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Study Target</h2>
        <p className="mt-0.5 text-xs text-muted">
          Configure how many hours you plan to dedicate to assessments and practice each week.
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <Input
            id="study-goal"
            label="Weekly Commitment"
            value={studyGoal}
            onChange={(e) => setStudyGoal(e.target.value)}
          />

          <Button type="submit">Save preferences</Button>
        </form>
      </PanelLarge>

      <PanelLarge>
        <h2 className="text-sm font-semibold text-danger">Sign Out</h2>
        <p className="mt-0.5 text-xs text-muted">
          Terminate your current authenticated session on this workstation.
        </p>
        <div className="mt-4">
          <Button variant="danger" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </PanelLarge>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
