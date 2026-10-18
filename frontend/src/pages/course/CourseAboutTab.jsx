/**
 * CourseAboutTab — /course/:id/about.
 *
 * What the course is (from its content file, or the catalog entry when the
 * content is not written yet), and the two things a student can change once it
 * is in My courses: why they are taking it, and when it has to be done.
 *
 * Removing the course from My courses is here too, and it is deliberately calm:
 * the confirm spells out that answers are kept, because they are - unenrolling
 * hides the course, it does not erase anything measured.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { updateEnrollment, unenroll } from '../../lib/enrollment.js'
import { sentenceCase } from '../../lib/text'
import { PanelLarge } from '../../components/ui/Panel'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Dialog } from '../../components/ui/Dialog.jsx'
import { IconCheck } from '../../components/ui/Icons'

function Detail({ label, value }) {
  return (
    <div className="py-2.5">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-ink">{value}</dd>
    </div>
  )
}

export default function CourseAboutTab() {
  const { courseId, entry, tree, enrollment, enrolled, userId } = useOutletContext()
  const navigate = useNavigate()

  const [goal, setGoal] = useState(enrollment?.goal ?? '')
  const [examDate, setExamDate] = useState(enrollment?.examDate ?? '')
  const [saved, setSaved] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setGoal(enrollment?.goal ?? '')
    setExamDate(enrollment?.examDate ?? '')
  }, [enrollment?.goal, enrollment?.examDate])

  const title = tree?.title ?? entry?.title ?? sentenceCase(courseId)
  const summary = tree?.summary || entry?.summary || ''
  const level = tree?.level || entry?.level || ''
  const hours = entry?.hours ?? null
  const prerequisites = entry?.prerequisites ?? []

  const save = (event) => {
    event.preventDefault()
    updateEnrollment(userId, courseId, { goal: goal.trim(), examDate })
    setSaved(true)
  }

  const remove = () => {
    unenroll(userId, courseId)
    setConfirmOpen(false)
    navigate('/courses')
  }

  return (
    <div className="space-y-4">
      <PanelLarge>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">About this course</h2>
          {enrolled ? <Badge tone="primary" label="Enrolled" /> : <Badge tone="neutral" label="Not enrolled" />}
        </div>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          {summary || 'This course has no summary yet.'}
        </p>

        <dl className="mt-3 divide-y divide-line border-t border-line">
          <Detail label="Level" value={level ? sentenceCase(level) : 'Not stated'} />
          <Detail label="Estimated hours" value={hours == null ? 'Not stated' : `${hours} hours`} />
          <Detail
            label="Prerequisites"
            value={prerequisites.length > 0 ? prerequisites.map(sentenceCase).join(', ') : 'None listed'}
          />
        </dl>
      </PanelLarge>

      {enrolled && (
        <PanelLarge>
          <h2 className="text-sm font-semibold text-ink">Your goal</h2>
          <p className="mt-0.5 text-xs text-muted">Both fields are optional, and can be changed at any time.</p>

          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={save}>
            <Input
              id="about-goal"
              label="Goal"
              placeholder="e.g. Pass the OS exam"
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value)
                setSaved(false)
              }}
            />
            <Input
              id="about-exam"
              type="date"
              label="Exam date"
              value={examDate}
              onChange={(event) => {
                setExamDate(event.target.value)
                setSaved(false)
              }}
            />
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" size="sm">
                Save
              </Button>
              {saved && (
                <span className="inline-flex items-center gap-1 text-[12px] text-success">
                  <IconCheck size={14} aria-hidden="true" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </PanelLarge>
      )}

      {enrolled && (
        <PanelLarge>
          <h2 className="text-sm font-semibold text-ink">Remove from My courses</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted">
            The course leaves My courses, and this page keeps working. Every answer you have given is kept, so
            your progress is still here if you add it back.
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmOpen(true)}>
            Remove from my courses
          </Button>
        </PanelLarge>
      )}

      <Dialog
        open={confirmOpen}
        title="Remove from My courses?"
        description={`${title} will no longer appear in My courses. Your answers and estimated mastery are kept.`}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  )
}
