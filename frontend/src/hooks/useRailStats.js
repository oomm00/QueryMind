/**
 * useRailStats — small derived stats for the app shell rail:
 * the Weak Areas count badge and weekly practice progress.
 *
 * All figures derive strictly from real backend attempt and mastery records.
 */

import { useQuery } from '@tanstack/react-query'
import { attemptsApi, masteryApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'

const WEEKLY_MINUTES_TARGET = 120 // 2 hour weekly study goal

function isThisWeek(timestamp) {
  if (!timestamp) return false
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return false
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return date >= oneWeekAgo && date <= now
}

export function useRailStats() {
  const { userId } = useAuth()

  const masteryQuery = useQuery({
    queryKey: ['rail', 'mastery', userId],
    queryFn: () => masteryApi.getMyMastery(),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 30_000,
  })

  const historyQuery = useQuery({
    queryKey: ['rail', 'history', userId],
    queryFn: () => attemptsApi.getHistory(userId),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 30_000,
  })

  let weakAreaCount = 0
  try {
    const records = Array.isArray(masteryQuery.data) ? masteryQuery.data : []
    weakAreaCount = records.filter(
      (r) => (r.attempts_count || 0) >= 2 && (r.mastery_score || 0) < 0.7
    ).length
  } catch {
    weakAreaCount = 0
  }

  let studiedMinutes = 0
  try {
    const history = Array.isArray(historyQuery.data)
      ? historyQuery.data
      : historyQuery.data?.attempts ?? []
    const weekAttempts = history.filter((a) => isThisWeek(a.submitted_at || a.created_at)).length
    // Each evaluated question represents ~5 minutes of deliberate technical practice
    studiedMinutes = weekAttempts * 5
  } catch {
    studiedMinutes = 0
  }

  return {
    weakAreaCount,
    weekly: { minutes: studiedMinutes, targetMinutes: WEEKLY_MINUTES_TARGET },
  }
}
