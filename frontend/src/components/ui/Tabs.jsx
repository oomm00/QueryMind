/**
 * Tabs — horizontal tab navigation.
 */

import React from 'react'

export function Tabs({ anid, children, onSelect, ...rest }) {
  return (
    <div className="tabs" role="tablist" aria-orientation="horizontal" {...rest}>
      {React.Children.map(children, (child, index) => {
        const isActive = anid === index
        const handleClick = () => onSelect?.(index)
        return React.cloneElement(child, {
          className: child.props.className
            ? `${child.props.className} ${isActive ? 'tab-active' : 'tab'}`
            : isActive ? 'tab-active' : 'tab',
          onClick: handleClick,
          'aria-selected': isActive,
          role: 'tab',
        })
      })}
    </div>
  )
}