import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../../context/AuthContext'
import { NotificationPopover } from './NotificationPopover'

function renderWithClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('NotificationPopover', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when closed', () => {
    const { container } = renderWithClient(
      <NotificationPopover isOpen={false} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders interactive notifications when open', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    renderWithClient(<NotificationPopover isOpen={true} onClose={handleClose} />)

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText('Weekly Practice Progress')).toBeInTheDocument()
    expect(screen.getByText('Targeted Study Mode Available')).toBeInTheDocument()
    expect(screen.getByText('Mastery-Calibrated Practice')).toBeInTheDocument()

    // Can mark all as read
    const markReadBtn = screen.getByRole('button', { name: 'Mark all read' })
    await user.click(markReadBtn)

    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument()
  })

  it('supports dismissing notifications', async () => {
    const user = userEvent.setup()
    renderWithClient(<NotificationPopover isOpen={true} onClose={vi.fn()} />)

    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss notification' })
    expect(dismissBtns.length).toBeGreaterThan(0)

    // Dismiss first notification
    await user.click(dismissBtns[0])
    expect(screen.queryByText('Weekly Practice Progress')).not.toBeInTheDocument()
  })
})
