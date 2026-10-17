/**
 * Tabs — horizontal tab navigation.
 *
 * Two APIs are supported:
 *   <Tabs tabs={[{ label, value }]} value={v} onChange={fn} />
 *   <Tabs anid={i} onSelect={fn}><button>…</button>…</Tabs>
 */

import React from 'react'
import { cx } from '../../lib/cx'

export function Tabs({ tabs, value, activeIndex, anid, onChange, onSelect, children, className, ...rest }) {
  const active = value ?? activeIndex ?? anid ?? 0

  if (tabs) {
    return (
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={cx('flex items-center gap-1 border-b border-line', className)}
        {...rest}
      >
        {tabs.map((tab, index) => {
          const key = tab.value ?? tab.id ?? index
          const isActive = key === active || index === active
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange?.(key)}
              className={cx(
                'relative -mb-px inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors duration-150',
                'border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                isActive
                  ? 'border-primary text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cx('flex items-center gap-1 border-b border-line', className)}
      {...rest}
    >
      {React.Children.map(children, (child, index) => {
        const isActive = anid === index
        const handleClick = () => onSelect?.(index)
        return React.cloneElement(child, {
          className: cx(
            'relative -mb-px inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150',
            isActive ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
            child.props.className
          ),
          onClick: handleClick,
          'aria-selected': isActive,
          role: 'tab',
        })
      })}
    </div>
  )
}

export default Tabs
