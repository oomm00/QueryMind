/**
 * ConceptMiniMap — the concept with the neighbours it is connected to inside its
 * topic. Every box says its status in words, a box is only a button when the
 * caller can act on a click, and a concept with nothing connected says so.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConceptMiniMap } from './ConceptMiniMap.jsx'

const concepts = [
  { id: 'paging', title: 'Paging', prerequisites: [] },
  { id: 'segmentation', title: 'Segmentation', prerequisites: [{ id: 'paging', title: 'Paging' }] },
  {
    id: 'working-sets',
    title: 'Working sets',
    prerequisites: [{ id: 'segmentation', title: 'Segmentation' }],
  },
]

const estimates = {
  paging: { value: 0.62, count: 4 },
}

function renderMap(props = {}) {
  return render(
    <MemoryRouter>
      <ConceptMiniMap concepts={concepts} concept={concepts[1]} {...props} />
    </MemoryRouter>
  )
}

describe('the picture', () => {
  it('draws the concept between what it needs and what needs it', () => {
    renderMap({ estimatesById: estimates, onSelect: vi.fn() })

    const svg = screen.getByRole('group', { name: /Segmentation and the concepts/ })
    // The prerequisite, this concept, and the status in words for each.
    expect(svg).toHaveTextContent('Paging')
    expect(svg).toHaveTextContent('Segmentation')
    expect(svg).toHaveTextContent('Learning · 62%')
    expect(svg).toHaveTextContent('No estimate')
    // Both directions, each said in words rather than by position alone.
    expect(
      screen.getByRole('button', { name: 'Paging, prerequisite. Learning · 62% estimated mastery.' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Working sets, requires this concept. No estimate.' })
    ).toBeInTheDocument()
  })

  it('says in words how many connections it drew', () => {
    renderMap({ estimatesById: estimates, onSelect: vi.fn() })

    expect(screen.getByText('1 prerequisite and 1 dependent in this topic.')).toBeInTheDocument()
  })

  it('says so when a concept has no neighbours instead of drawing an empty frame', () => {
    const lonely = { id: 'lonely', title: 'Lonely concept', prerequisites: [] }
    renderMap({ concepts: [lonely], concept: lonely })

    expect(
      screen.getByText('Nothing in this topic is connected to this concept yet.')
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('only makes a box clickable when the caller passed a handler', () => {
    renderMap({ estimatesById: estimates })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('links to the full graph when the caller gives it somewhere to go', () => {
    renderMap({ estimatesById: estimates, graphTo: '/map/os/fixture-topic' })

    expect(screen.getByRole('link', { name: 'Open full graph' })).toHaveAttribute(
      'href',
      '/map/os/fixture-topic'
    )
  })
})

describe('choosing a neighbour', () => {
  it('selects the prerequisite that was clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderMap({ estimatesById: estimates, onSelect })

    await user.click(
      screen.getByRole('button', {
        name: 'Paging, prerequisite. Learning · 62% estimated mastery.',
      })
    )

    expect(onSelect).toHaveBeenCalledWith('paging')
  })

  it('can be reached from the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderMap({ estimatesById: estimates, onSelect })

    const node = screen.getByRole('button', { name: /Paging, prerequisite/ })
    node.focus()
    expect(node).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('paging')
  })
})
