/**
 * CommandPalette — ⌘K / Ctrl+K navigation stub. Filters the rail destinations
 * and navigates on select. Intentionally lightweight (keyboard-first).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../navigation'
import { IconSearch } from './ui/Icons'
import { cx } from '../lib/cx'

export function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
    return undefined
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return NAV_ITEMS
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q))
  }, [query])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }

  const onInputKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active])
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--overlay)] p-4 pt-[12vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg animate-slide-up overflow-hidden rounded-panel border border-line bg-surface shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <IconSearch size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search anything"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline-block">
            Esc
          </kbd>
        </div>

        <ul className="qm-scroll max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted">No matches for “{query}”</li>
          )}
          {results.map((item, index) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm',
                    index === active ? 'bg-primary-tint text-primary' : 'text-ink hover:bg-surface-raised'
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default CommandPalette
