/**
 * EnrollDialog — the two optional things a student may say when adding a course
 * to My courses: what they are aiming at, and when it has to be done.
 *
 * Both are optional on purpose. "Skip" closes without enrolling; "Enroll" adds
 * the course with whatever was typed, and both fields can be filled in later
 * from the About tab.
 */

import React, { useState } from 'react'
import { Dialog } from '../ui/Dialog.jsx'
import { Button } from '../ui/Button.jsx'
import { Input } from '../ui/Input.jsx'

export function EnrollDialog({ open, courseTitle, onClose, onEnroll }) {
  const [goal, setGoal] = useState('')
  const [examDate, setExamDate] = useState('')

  const submit = (event) => {
    event.preventDefault()
    onEnroll({ goal: goal.trim(), examDate })
  }

  return (
    <Dialog
      open={open}
      title="Add to My courses"
      description={
        courseTitle
          ? `${courseTitle} will appear in My courses. Both fields are optional.`
          : 'Both fields are optional.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button type="submit" form="enroll-form">
            Enroll
          </Button>
        </>
      }
    >
      <form id="enroll-form" className="space-y-3" onSubmit={submit}>
        <Input
          id="enroll-goal"
          label="Goal (optional)"
          placeholder="e.g. Pass the OS exam"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
        <Input
          id="enroll-exam"
          type="date"
          label="Exam date (optional)"
          value={examDate}
          onChange={(event) => setExamDate(event.target.value)}
        />
      </form>
    </Dialog>
  )
}

export default EnrollDialog
