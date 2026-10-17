/**
 * ConceptNode — one concept card on the topic graph (170x72).
 *
 * Shows the status icon, the concept name and the status line, so the same
 * information is available from the card, the side panel and the list view.
 * The card is the interactive element: focusable by keyboard, selectable with
 * Enter/Space, and it hands arrow keys to the page, which walks the edges.
 *
 * The card is deliberately not a link: selecting a concept is a graph action,
 * and the panel then offers the lesson and the practice check.
 */

import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { cx } from '../../lib/cx'
import { NODE_HEIGHT, NODE_WIDTH } from '../../lib/graphLayout'
import { sentenceCase } from '../../lib/text'
import { statusFor, statusLine, toneClass } from './conceptStatus'

/** Invisible, so edges meet the card edge without a dot in the corner. */
const HANDLE_STYLE = {
  opacity: 0,
  width: 2,
  height: 2,
  minWidth: 2,
  minHeight: 2,
  border: 'none',
  background: 'transparent',
}

export function ConceptNode({ id, data, selected }) {
  const { concept, mastery, dimmed, matched, onSelect, onKeyNav } = data
  const status = statusFor(mastery)
  const Icon = status.icon
  const label = `${sentenceCase(concept.title)}. ${statusLine(mastery)}.`

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(concept.id)
      return
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      onKeyNav?.(concept.id, event.key)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={Boolean(selected)}
      aria-label={label}
      onClick={() => onSelect?.(concept.id)}
      onKeyDown={handleKeyDown}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cx(
        'flex cursor-pointer flex-col justify-center gap-1 overflow-hidden rounded-panel border px-3 text-left transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        selected
          ? 'border-2 border-primary bg-primary-tint'
          : matched
            ? 'border-primary bg-surface'
            : 'border-line bg-surface',
        dimmed && 'opacity-35'
      )}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} isConnectable={false} />

      <p className="flex items-center gap-1.5 text-[13px] font-medium leading-tight text-ink">
        <Icon size={14} className={cx('shrink-0', toneClass(status.tone))} />
        <span className="truncate">{sentenceCase(concept.title)}</span>
      </p>
      <p className="text-[10px] leading-tight text-muted">{statusLine(mastery)}</p>

      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  )
}

export default ConceptNode
