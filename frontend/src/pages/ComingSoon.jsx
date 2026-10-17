/**
 * ComingSoon — placeholder for routes that are wired up but not yet built.
 */

import React from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { IconInfo } from '../components/ui/Icons'

export default function ComingSoon({ title = 'Coming soon', description }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={IconInfo}
          title="Coming soon"
          description={
            description || 'This area is not built yet. It will appear here once it ships.'
          }
        />
      </div>
    </>
  )
}
