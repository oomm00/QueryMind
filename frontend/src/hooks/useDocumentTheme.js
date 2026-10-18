/**
 * useDocumentTheme — the theme that is actually applied to the document.
 *
 * useTheme keeps its own state per component, so only the component that owns
 * the toggle (the app shell) re-renders when the theme changes. Components that
 * merely need to match the theme — like the graph canvas, which has to tell
 * React Flow which of its two colour modes to draw — should read the applied
 * attribute instead, and re-read it whenever it changes.
 */

import { useEffect, useState } from 'react'

function readAppliedTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function useDocumentTheme() {
  const [theme, setTheme] = useState(readAppliedTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readAppliedTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    setTheme(readAppliedTheme())
    return () => observer.disconnect()
  }, [])

  return theme
}

export default useDocumentTheme
