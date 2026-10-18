/**
 * useMediaQuery — subscribes to a CSS media query.
 *
 * Used to pick the right initial state for the lesson workspace panels: an
 * expanded column on desktop, a closed drawer below lg. The initial value is
 * read synchronously so the first paint matches the viewport.
 */

import { useEffect, useState } from 'react'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const list = window.matchMedia(query)
    const onChange = (event) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export default useMediaQuery
