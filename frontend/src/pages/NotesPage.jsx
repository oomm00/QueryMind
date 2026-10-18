/**
 * NotesPage — /notes.
 *
 * My notes is where a student's own material lives, and the first thing that
 * belongs there is the documents question generation reads back. The page is a
 * tab strip with one tab so far: Documents. The upload form and the table of
 * what has been uploaded moved here from the old /upload page, which now
 * redirects to this tab so nothing that pointed at it breaks.
 */

import React, { useState } from 'react'

import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { Tabs } from '../components/ui/Tabs'
import { PageHeader } from '../components/ui/PageHeader'
import { DocumentsPanel } from '../components/documents/DocumentsPanel.jsx'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

const TABS = [{ value: 'documents', label: 'Documents' }]

export default function NotesPage() {
  const [tab, setTab] = useState('documents')

  useBreadcrumbs([WORKSPACE_CRUMB, { label: 'My notes' }])

  return (
    <div>
      <PageHeader
        title="My notes"
        description="The material you add here is what question generation reads back, filed by the subject and topic you give it."
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="mt-5">{tab === 'documents' && <DocumentsPanel />}</div>
    </div>
  )
}
