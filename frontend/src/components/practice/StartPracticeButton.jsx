/**
 * StartPracticeButton — the one button that begins a practice session.
 *
 * It reads the course tree and the student's answers, asks buildSession what to
 * ask, writes the session, and goes straight to question one. There is no setup
 * page: the scope and the level are the button's own arguments, so a topic row,
 * a concept row, a lesson's "practise this" and the mixed button on the practice
 * home all start the same way.
 *
 * The button is disabled, with an honest label, when the scope holds no
 * questions at all — a property of the scope, not of the level selected.
 *
 * The practice board uses it with scope "custom", the topics it ticked, and a
 * label for the session. Free practice is not a course, so it never enrols.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { usePracticeData } from '../../hooks/usePracticeData.js'
import { usePracticeContext } from '../../hooks/usePracticeContext.js'
import { buildSession, scopeQuestionCount, DEFAULT_SESSION_COUNT } from '../../lib/buildSession.js'
import { newSession, holdDraft } from '../../lib/sessions.js'
import { enroll, isEnrolled, useEnrollments } from '../../lib/enrollment.js'
import { contentCourseIds } from '../../content/practiceBank.js'
import { flashState } from '../routing/FlashHost.jsx'
import { Button } from '../ui/Button.jsx'

export function StartPracticeButton({
  courseId,
  scope = 'course',
  scopeId = null,
  level = 'mixed',
  count = DEFAULT_SESSION_COUNT,
  questionIds = null,
  topicIds = null,
  subject = null,
  sessionLabel = '',
  label = 'Start practice',
  emptyLabel = 'No questions yet',
  variant = 'primary',
  size = 'md',
  className,
  fullWidth = false,
  enroll: shouldEnroll = false,
  flashTitle = 'Added to My courses',
  flashDescription,
}) {
  const navigate = useNavigate()
  const { userId } = useAuth()
  // Mixed practice draws from every course the student is enrolled in, a custom
  // session from every course that holds the topics it was given, and every
  // other scope from the single course it belongs to.
  const enrollments = useEnrollments(userId)
  const enrolledIds = Object.keys(enrollments.courses ?? {})
  const courseIds = scope === 'mixed' ? enrolledIds : scope === 'custom' ? contentCourseIds() : [courseId]
  const { data: courses = [], isLoading } = usePracticeData(courseIds)
  const context = usePracticeContext(userId)

  const request = { courseId, scope, scopeId, level, count, questionIds, topicIds, subject }
  const data = { ...context, courses }
  const total = scopeQuestionCount(request, data)
  const empty = !isLoading && total === 0

  const start = () => {
    const built = buildSession(request, data)
    if (built.questions.length === 0) return

    const added = shouldEnroll && !isEnrolled(userId, courseId)
    if (shouldEnroll) enroll(userId, courseId)

    const session = newSession({
      courseId: built.courseId ?? courseId,
      scope,
      scopeId: built.scopeId ?? scopeId,
      subject: built.subject ?? subject,
      level,
      label: sessionLabel,
      questionIds: built.questions.map((question) => question.question_id),
      note: built.note,
    })
    // Drawn, not yet stored: the session reaches storage with its first answer,
    // so the recent list never holds a row that says "0 answered".
    holdDraft(session)
    navigate(
      `/practice/${session.id}`,
      added ? { state: flashState(flashTitle, flashDescription) } : undefined
    )
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      fullWidth={fullWidth}
      disabled={empty}
      onClick={start}
    >
      {empty ? emptyLabel : label}
    </Button>
  )
}

export default StartPracticeButton
