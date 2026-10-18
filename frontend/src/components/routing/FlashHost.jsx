/**
 * FlashHost — shows a one-off message a page asked for while navigating away.
 *
 * A Start button that enrols a course navigates at the same moment it enrols,
 * so a toast owned by the page it left would never be seen. The message rides
 * along in the navigation state instead and is shown here, once, after the new
 * page has mounted.
 */

import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Toast } from '../ui/Toast'

/** The state to pass to navigate() when a navigation should flash a message. */
export function flashState(title, description) {
  return { flash: { title, description } }
}

export function FlashHost() {
  const location = useLocation()
  const navigate = useNavigate()
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    const next = location.state?.flash
    if (!next) return
    setFlash(next)
    // Drop the message from history so a refresh does not show it again.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location, navigate])

  if (!flash) return null

  return (
    <Toast
      title={flash.title}
      description={flash.description}
      variant={flash.variant}
      onClose={() => setFlash(null)}
    />
  )
}

export default FlashHost
