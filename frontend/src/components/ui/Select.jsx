/**
 * Select — native dropdown select.
 * Renders its <option> children and forwards value/onChange/name/id/disabled.
 * Styling comes from the `input` class supplied by the caller.
 */

import React from 'react'

export function Select({ children, className, ...rest }) {
  return (
    <select
      className={className || 'input'}
      {...rest}
    >
      {children}
    </select>
  )
}

export default Select
