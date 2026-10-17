/**
 * BlockRenderer — renders a lesson's blocks.
 *
 * Handles every block kind in the content schema: paragraph, heading, bullets,
 * code, callout, diagram (variant "address-split"), check and note. The
 * canonical shape is `kind`; a legacy lesson-level `check` object is folded into
 * `blocks` by the content loader, so it arrives here as an ordinary check block.
 *
 * The column is capped at 68ch so the line length stays readable.
 */

import React from 'react'
import { cx } from '../../lib/cx'
import { IconAlert, IconInfo } from '../ui/Icons'
import { CheckBlock } from './CheckBlock'
import { AddressSplitDiagram } from './AddressSplitDiagram'

const CALLOUT_TONES = {
  tip: 'border-primary bg-primary-tint',
  warning: 'border-warning bg-warning-tint',
}

function Block({ block, lessonId, index }) {
  switch (block.kind) {
    case 'heading':
      return (
        <h2 className="pt-2 text-lg font-semibold tracking-tight text-ink">{block.text}</h2>
      )

    case 'paragraph':
      return <p className="text-[15px] leading-relaxed text-ink">{block.text}</p>

    case 'bullets':
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
          {(block.items ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )

    case 'code':
      return (
        <figure className="overflow-hidden rounded-panel border border-line bg-surface-raised">
          {block.label && (
            <figcaption className="border-b border-line px-3 py-2 text-xs font-medium text-muted">
              {block.label}
            </figcaption>
          )}
          <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-relaxed text-ink">
            <code className="font-mono">{block.text}</code>
          </pre>
        </figure>
      )

    case 'callout':
      return (
        <aside
          className={cx('rounded-panel border p-4', CALLOUT_TONES[block.tone] || CALLOUT_TONES.tip)}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            {block.tone === 'warning' ? <IconAlert size={16} /> : <IconInfo size={16} />}
            {block.title}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{block.text}</p>
        </aside>
      )

    case 'note':
      return (
        <p className="border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-muted">
          {block.text}
        </p>
      )

    case 'diagram':
      return <AddressSplitDiagram variant={block.variant} data={block.data} />

    case 'check':
      return <CheckBlock block={block} lessonId={lessonId} blockIndex={index} />

    default:
      if (import.meta.env.DEV) {
        console.warn(`[content] unknown block kind: ${block.kind}`)
      }
      return null
  }
}

export function BlockRenderer({ blocks = [], lessonId, className }) {
  return (
    <div className={cx('max-w-[68ch] space-y-5', className)}>
      {blocks.map((block, index) => (
        <Block key={`${block.kind}-${index}`} block={block} lessonId={lessonId} index={index} />
      ))}
    </div>
  )
}

export default BlockRenderer
