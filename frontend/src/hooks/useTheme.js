/**
 * useTheme — light/dark theme state.
 *
 * The initial value is read from the `data-theme` attribute that index.html's
 * pre-paint script sets (localStorage preference, falling back to the system
 * preference). Changes are applied to <html data-theme> and persisted.
 */

import { useCallback, useEffect, useState } from 'react'

export const THEME_KEY = 'qm-theme'

export function getInitialTheme() {
  if (typeof document === 'undefined') return 'light'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next) => {
    setThemeState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      try {
        localStorage.setItem(THEME_KEY, value)
      } catch {
        /* ignore */
      }
      return value
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [setTheme])

  return { theme, setTheme, toggleTheme }
}
