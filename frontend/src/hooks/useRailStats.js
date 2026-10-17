/**
 * useRailStats — small derived stats for the app shell rail:
 * the Weak Areas count badge and the weekly study goal progress.
 *
 * Reads through the existing API layer (mocked in dev) and degrades to safe
 * defaults if anything is unavailable.
 */

import { useQuery } from '@tanstack/react-query'
import { profileApi } from '../api/index.js'
import { selectPerTopicAverages } from '../api/adapter.js'
import { useAuth } from '../context/AuthContext.jsx'

// Weekly study-goal clock. Mocked for now: the real source (accumulated session
// minutes) lands with the sessions API.
const WEEKLY_MINUTES = 200 // 3h 20m studied
const WEEKLY_MINUTES_TARGET = 300 // 5h goal

export function useRailStats() {
  const { userId } = useAuth()

  const profile = useQuery({
    queryKey: ['rail', 'profile', userId],
    queryFn: () => profileApi.getProfile(userId),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 60_000,
  })

  let weakAreaCount = 0
  try {
    const rows = selectPerTopicAverages(profile.data?.mastery_breakdown || [])
    weakAreaCount = rows.filter((row) => row.average_score < 0.7).length
  } catch {
    weakAreaCount = 0
  }

  return {
    weakAreaCount,
    weekly: { minutes: WEEKLY_MINUTES, targetMinutes: WEEKLY_MINUTES_TARGET },
  }
}
