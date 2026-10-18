/**
 * AddressSplitDiagram — the `diagram` block with variant "address-split".
 *
 * Shows one virtual address split into page number + offset, the page-table
 * lookup that swaps the page for a frame, and the resulting physical address.
 * The offset cell is highlighted in both rows because it is the part that does
 * not change.
 *
 * Pure HTML/CSS (no fixed SVG coordinates) so it re-themes with the app and
 * reflows on narrow columns. Driven entirely by the block's `data`.
 */

import React from 'react'
import { cx } from '../../lib/cx'

function format(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : null
}

function Cell({ label, value, tone = 'neutral', note }) {
  return (
    <div
      className={cx(
        'rounded-control border px-3 py-2',
        tone === 'offset' ? 'border-primary bg-primary-tint' : 'border-line bg-surface'
      )}
    >
      <span className="block text-[10px] font-semibold text-muted">{label}</span>
      <span className="block font-mono text-sm font-medium tabular-nums text-ink">
        {format(value) ?? String(value ?? '—')}
      </span>
      {note && <span className="block text-[10px] text-muted">{note}</span>}
    </div>
  )
}

export function AddressSplitDiagram({ variant = 'address-split', data = {} }) {
  if (variant !== 'address-split') return null

  const { virtualAddress, pageSize, page, offset, frame, physicalAddress, caption } = data
  const bits =
    typeof pageSize === 'number' && pageSize > 1 ? Math.round(Math.log2(pageSize)) : null
  const offsetLabel = bits ? `Offset (${bits} bits)` : 'Offset'

  const description = [
    format(virtualAddress) ? `Virtual address ${format(virtualAddress)}` : 'A virtual address',
    `splits into page ${page ?? '?'} and offset ${offset ?? '?'}`,
    frame != null ? `the page table maps the page to frame ${frame}` : null,
    format(physicalAddress) ? `giving physical address ${format(physicalAddress)}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <figure className="rounded-panel border border-line bg-surface-raised p-4">
      <div role="img" aria-label={description}>
        <div aria-hidden="true" className="space-y-2.5">
          <p className="text-xs font-medium text-muted">
            Virtual address {format(virtualAddress) ?? '—'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Cell label="Page number" value={page} />
            <Cell label={offsetLabel} value={offset} tone="offset" />
          </div>

          <p className="flex items-center justify-center gap-2 py-0.5 text-xs text-muted">
            <span aria-hidden="true">↓</span>
            <span className="font-mono">
              page table[{page ?? '—'}] = {frame ?? '—'}
            </span>
          </p>

          <p className="text-xs font-medium text-muted">
            Physical address {format(physicalAddress) ?? '—'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Cell label="Frame number" value={frame} />
            <Cell label={offsetLabel} value={offset} tone="offset" note="unchanged" />
          </div>
        </div>
      </div>

      {caption && <figcaption className="mt-3 text-center text-xs text-muted">{caption}</figcaption>}
    </figure>
  )
}

export default AddressSplitDiagram
