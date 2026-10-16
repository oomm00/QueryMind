/**
 * Input — single-line text input.
 */

import React from 'react'

export function Input({ type = 'text', placeholder, value, onChange, disabled, className, ...rest }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`input ${className || ''}`}
      {...rest}
    />
  )
}

export default Input
