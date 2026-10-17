/**
 * useBreadcrumbs — lets the routed page declare the crumbs shown in the
 * AppShell top bar, e.g. useBreadcrumbs([{ label: 'Workspace' }, { label: 'Explore' }]).
 *
 * Only the label is required. A crumb with a `to` renders as a link; the last
 * crumb is always plain text. Pages that do not call this fall back to the
 * route-derived crumbs in navigation.js, so nothing breaks if a page forgets.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CrumbContext = createContext(null)

/** Read-only access for AppShell's top bar. */
export { CrumbContext as BreadcrumbContext }

/** Mounted once by AppShell; owns the current crumbs and clears them on route change. */
export function BreadcrumbProvider({ children }) {
  const [crumbs, setCrumbs] = useState(null)

  const value = useMemo(
    () => ({
      crumbs,
      set: (next) => {
        const list = Array.isArray(next) && next.length ? next : null
        setCrumbs((current) => {
          // Structural compare so a re-render with the same crumbs is a no-op.
          const same =
            current &&
            list &&
            current.length === list.length &&
            current.every(
              (crumb, index) => crumb.label === list[index].label && crumb.to === list[index].to
            )
          return same ? current : list
        })
      },
    }),
    [crumbs]
  )

  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>
}

/**
 * Declare this page's breadcrumbs. Pass the full trail, including "Workspace".
 * @param {Array<{label: string, to?: string}>} crumbs
 */
export function useBreadcrumbs(crumbs) {
  const ctx = useContext(CrumbContext)
  // Serialise once so a fresh array literal on every render is still stable.
  const signature = JSON.stringify(crumbs ?? null)

  useEffect(() => {
    if (!ctx || signature == null) return undefined
    ctx.set(JSON.parse(signature))
    return () => ctx.set(null)
  }, [ctx, signature])
}

export default useBreadcrumbs
