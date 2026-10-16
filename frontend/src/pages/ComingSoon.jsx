/**
 * ComingSoon — placeholder for pages not yet built.
 * Used as route destination for unimplemented navigation items.
 */

import React from 'react'
import { EmptyState } from '../components/ui/EmptyState'

export default function ComingSoon() {
  return (
    <EmptyState
      icon="ℹ️"
      title="Coming Soon"
      description="This feature is under development. Check back later!"
    />
  )
}