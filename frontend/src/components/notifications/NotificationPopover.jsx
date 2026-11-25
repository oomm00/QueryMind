import React, { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRailStats } from '../../hooks/useRailStats'
import { IconAlert, IconBell, IconCheck, IconClose, IconInfo, IconTarget } from '../ui/Icons'
import { cx } from '../../lib/cx'

const STORAGE_KEY = 'qm_read_notifications_v1'

function getReadIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveReadIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage quota or blocked
  }
}

export function NotificationPopover({ isOpen, onClose }) {
  const navigate = useNavigate()
  const stats = useRailStats()
  const [readIds, setReadIds] = useState(getReadIds)
  const [dismissedIds, setDismissedIds] = useState([])

  const rawNotifications = useMemo(() => {
    const list = []
    const weakCount = stats.weakAreaCount || 0
    const answered = stats.weekly?.questionsAnswered || 0
    const target = stats.weekly?.targetQuestions || 20

    if (weakCount > 0) {
      list.push({
        id: 'weak_areas_alert',
        title: 'Focus Area Practice Needed',
        message: `${weakCount} concept${weakCount > 1 ? 's need' : ' needs'} reinforcement with accuracy below 70%.`,
        actionLabel: 'Review in Analytics',
        actionTo: '/analytics',
        category: 'Focus',
        icon: IconAlert,
        iconClass: 'text-warning bg-warning/10',
      })
    }

    list.push({
      id: 'weekly_goal_update',
      title: 'Weekly Practice Progress',
      message: `${answered} of ${target} questions answered this week. Keep your consistency streak alive!`,
      actionLabel: 'Continue Practice',
      actionTo: '/practice',
      category: 'Goal',
      icon: IconTarget,
      iconClass: 'text-primary bg-primary/10',
    })

    list.push({
      id: 'targeted_study_feature',
      title: 'Targeted Study Mode Available',
      message: 'Practice any specific Bloom taxonomy rung (Remember through Create) with 1 to 10 instant questions.',
      actionLabel: 'Launch Targeted Study',
      actionTo: '/practice',
      category: 'New Feature',
      icon: IconInfo,
      iconClass: 'text-cyan-400 bg-cyan-500/10',
    })

    list.push({
      id: 'adaptive_calibrated',
      title: 'Mastery-Calibrated Practice',
      message: 'Adaptive sessions now automatically skip mastered lower rungs (≥ 70%) to challenge your highest cognitive tier.',
      actionLabel: 'Check Mastery',
      actionTo: '/mastery',
      category: 'System',
      icon: IconCheck,
      iconClass: 'text-success bg-success/10',
    })

    return list
  }, [stats])

  const notifications = useMemo(() => {
    return rawNotifications.filter((n) => !dismissedIds.includes(n.id))
  }, [rawNotifications, dismissedIds])

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.includes(n.id)).length
  }, [notifications, readIds])

  const markAllRead = () => {
    const allIds = rawNotifications.map((n) => n.id)
    setReadIds(allIds)
    saveReadIds(allIds)
  }

  const dismiss = (id, e) => {
    e.stopPropagation()
    setDismissedIds((prev) => [...prev, id])
  }

  const handleAction = (to, id) => {
    if (!readIds.includes(id)) {
      const next = [...readIds, id]
      setReadIds(next)
      saveReadIds(next)
    }
    onClose()
    navigate(to)
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-panel border border-line bg-surface shadow-pop animate-fade-in overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-raised/40">
        <div className="flex items-center gap-2">
          <IconBell size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-ink">Notifications</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[11px] font-medium text-muted hover:text-ink transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-line/60">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-muted mb-2">
              <IconCheck size={20} />
            </div>
            <p className="text-sm font-medium text-ink">All caught up</p>
            <p className="mt-1 text-xs text-muted">No unread alerts or notifications right now.</p>
          </div>
        ) : (
          notifications.map((n) => {
            const isUnread = !readIds.includes(n.id)
            const Icon = n.icon
            return (
              <div
                key={n.id}
                onClick={() => handleAction(n.actionTo, n.id)}
                className={cx(
                  'group relative flex cursor-pointer gap-3 p-4 transition-colors hover:bg-surface-raised/50',
                  isUnread && 'bg-primary/[0.03]'
                )}
              >
                <div
                  className={cx(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    n.iconClass
                  )}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {n.category}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => dismiss(n.id, e)}
                      aria-label="Dismiss notification"
                      className="text-muted opacity-0 group-hover:opacity-100 hover:text-ink transition-opacity"
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                  <h4
                    className={cx(
                      'mt-0.5 text-xs font-semibold leading-snug',
                      isUnread ? 'text-ink' : 'text-muted'
                    )}
                  >
                    {n.title}
                  </h4>
                  <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                    {n.message}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                    <span>{n.actionLabel}</span>
                    <span aria-hidden="true">&rarr;</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
