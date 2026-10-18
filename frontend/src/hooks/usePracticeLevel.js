/**
 * usePracticeLevel — the Level control, remembered per course.
 *
 * Practice starts on "mixed" until the student says otherwise, and the choice is
 * kept so every Start button on the course page asks the same kind of question
 * on the next visit.
 */

import { useCallback, useState } from 'react'

const KEY_PREFIX = 'qm_practice_level_'

function keyFor(userId, courseId) {
  return `${KEY_PREFIX}${userId || 'anonymous'}_${courseId || 'none'}`
}

export function readPracticeLevel(userId, courseId) {
  try {
    const value = window.localStorage.getItem(keyFor(userId, courseId))
    return value || 'mixed'
  } catch {
    return 'mixed'
  }
}

export function writePracticeLevel(userId, courseId, level) {
  try {
    window.localStorage.setItem(keyFor(userId, courseId), level)
  } catch {
    // Storage full or blocked: the choice simply does not persist.
  }
}

export function usePracticeLevel(userId, courseId) {
  const [level, setLevelState] = useState(() => readPracticeLevel(userId, courseId))

  const setLevel = useCallback(
    (next) => {
      setLevelState(next)
      writePracticeLevel(userId, courseId, next)
    },
    [userId, courseId]
  )

  return [level, setLevel]
}

export default usePracticeLevel
