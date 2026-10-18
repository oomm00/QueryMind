/**
 * useBreadcrumbs — lets the routed page declare the crumbs shown in the
 * AppShell top bar, e.g. useBreadcrumbs([{ label: 'Workspace' }, { label: 'Explore' }]).
 *
 * Only the label is required. A crumb with a `to` renders as a link; the last
 * crumb is always plain text. Pages that do not call this fall back to the
 * route-derived crumbs in navigation.js, so nothing breaks if a page forgets.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CrumbContext = createContext(null)

/** Read-only access for AppShell's top bar. */
export { CrumbContext as BreadcrumbContext }

/** Mounted once by AppShell; owns the current crumbs and clears them on route change. */
export function BreadcrumbProvider({ children }) {
  const [crumbs, setCrumbs] = useState(null)

  // Stable identity on purpose. The consumer below sets crumbs from an effect,
  // so if `set` were recreated whenever the crumbs changed, that effect would
  // re-run, clear the crumbs and set them again — a render loop that hit
  // "Maximum update depth exceeded" on every page that declares a trail.
  const set = useCallback((next) => {
    const list = Array.isArray(next) && next.length ? next : null
    setCrumbs((current) => {
      // Structural compare so re-declaring the same crumbs keeps the array
      // identity, which also keeps consumers from re-rendering.
      const same =
        current &&
        list &&
        current.length === list.length &&
        current.every(
          (crumb, index) => crumb.label === list[index].label && crumb.to === list[index].to
        )
      return same ? current : list
    })
  }, [])

  const value = useMemo(() => ({ crumbs, set }), [crumbs, set])

  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>
}

/**
 * Declare this page's breadcrumbs. Pass the full trail, including "Workspace".
 *
 * The effect depends on the serialised trail and the stable setter only, so a
 * fresh array literal on every render is harmless.
 *
 * @param {Array<{label: string, to?: string}>} crumbs
 */
export function useBreadcrumbs(crumbs) {
  const ctx = useContext(CrumbContext)
  const set = ctx?.set
  const signature = JSON.stringify(crumbs ?? null)

  useEffect(() => {
    if (!set || signature == null) return undefined
    set(JSON.parse(signature))
    return () => set(null)
  }, [set, signature])
}

export default useBreadcrumbs
