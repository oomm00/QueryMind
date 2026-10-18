/**
 * ResourceCard — study material is optional reading, so the card shows what the
 * content file authored, opens in a new tab, and remembers being opened without
 * ever standing between the student and practice.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { resource } from '../../__fixtures__/content.js'
import { resetStudyMaterial } from '../../content/studyMaterial.js'
import { ResourceCard } from './ResourceCard.jsx'

const STORAGE_KEY = 'qm.study-material.v1'

function renderCard(cardResource = resource) {
  return render(
    <ul>
      <ResourceCard resource={cardResource} />
    </ul>
  )
}

beforeEach(() => {
  resetStudyMaterial()
})

describe('what the card shows', () => {
  it('shows every authored field, and nothing of its own', () => {
    renderCard()

    expect(screen.getByText(resource.title)).toBeInTheDocument()
    expect(
      screen.getByText('Article · Example Press · 12 min')
    ).toBeInTheDocument()
    expect(screen.getByText(resource.why)).toBeInTheDocument()
    expect(screen.getByText('CC BY 4.0 · link checked 2026-09-01')).toBeInTheDocument()
  })

  it('leaves out a field the content does not have', () => {
    renderCard({ title: 'A link with nothing else', url: 'https://example.com/only', type: 'docs' })

    expect(screen.getByText('Documentation')).toBeInTheDocument()
    expect(screen.queryAllByText(/ · /)).toHaveLength(0)
    expect(screen.queryAllByText(/min/)).toHaveLength(0)
  })
})

describe('the link', () => {
  it('opens the authored URL in a new tab, safely', () => {
    renderCard()

    const link = screen.getByRole('link', { name: /Fixture reading/ })
    expect(link).toHaveAttribute('href', resource.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    // The new tab is said in words too, not only by the attribute.
    expect(within(link).getByText('(opens in a new tab)')).toBeInTheDocument()
  })
})

describe('marking a link as opened', () => {
  it('records the action for this browser session', async () => {
    const user = userEvent.setup()
    renderCard()

    const button = screen.getByRole('button', { name: 'Mark as opened' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)

    expect(screen.getByRole('button', { name: /Marked as opened/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))
    expect(Object.keys(stored.opened)).toEqual([resource.url])
  })

  it('can be undone', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Mark as opened' }))
    await user.click(screen.getByRole('button', { name: /Marked as opened/ }))

    expect(screen.getByRole('button', { name: 'Mark as opened' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)).opened).toEqual({})
  })
})

describe('nothing is gated on reading', () => {
  it('has one control, enabled, and starts unopened', () => {
    renderCard()

    const card = screen.getByRole('listitem')
    const control = within(card).getByRole('button')
    expect(within(card).getAllByRole('button')).toHaveLength(1)
    expect(control).toBeEnabled()
    expect(control).toHaveAttribute('aria-pressed', 'false')
    // Nothing to tick off, and nothing marked as required.
    expect(within(card).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(card).queryByText(/required/i)).not.toBeInTheDocument()
  })
})
