/**
 * Textarea — multi-line text input.
 */

import React from 'react'

export function Textarea({ placeholder, value, onChange, disabled, className, rows = 3, ...rest }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`textarea ${className || ''}`}
      rows={rows}
      {...rest}
    />
  )
}

export default Textarea
