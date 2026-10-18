/**
 * CoursePage — /course/:id, the shell for the four course tabs.
 *
 * The page leads with what the course is and one action; the tabs below are the
 * only way to reach everything else, and each is its own route. Practice,
 * study material and progress are deliberately separate places, so the shell
 * loads the course once and hands the tabs what they need through the outlet
 * context rather than each fetching its own copy.
 *
 * Nothing on the header is invented: the title and summary come from the content
 * (or the catalog entry), and the primary button says "Continue" only once there
 * is a topic to continue with.
 */

import React, { useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCatalog } from '../../hooks/useCatalog'
import { usePracticeData } from '../../hooks/usePracticeData.js'
import { usePracticeContext } from '../../hooks/usePracticeContext.js'
import { usePracticeLevel } from '../../hooks/usePracticeLevel.js'
import { useBreadcrumbs } from '../../hooks/useBreadcrumbs'
import { useAuth } from '../../context/AuthContext.jsx'
import { useEnrollments, enroll as saveEnrollment } from '../../lib/enrollment.js'
import { nextTopicOf } from '../../lib/buildSession.js'
import { sentenceCase } from '../../lib/text'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { PanelLarge } from '../../components/ui/Panel'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { CourseTabs } from '../../components/practice/CourseTabs.jsx'
import { StartPracticeButton } from '../../components/practice/StartPracticeButton.jsx'
import { EnrollDialog } from '../../components/practice/EnrollDialog.jsx'
import { flashState } from '../../components/routing/FlashHost.jsx'
import { IconLearning, IconSearch } from '../../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }
const EXPLORE_CRUMB = { label: 'Explore', to: '/explore' }

function CourseSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      <Skeleton className="mt-6 h-10 w-full max-w-lg" />
      <Skeleton className="mt-6 h-64" />
    </div>
  )
}

export default function CoursePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { userId } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: catalog, isLoading: catalogLoading } = useCatalog()
  const { data: trees = [], isLoading: treeLoading } = usePracticeData([id])
  const context = usePracticeContext(userId)
  const enrollments = useEnrollments(userId)
  const [level, setLevel] = usePracticeLevel(userId, id)

  const tree = trees[0] ?? null
  const entry = Array.isArray(catalog) ? catalog.find((item) => item.id === id) ?? null : null
  const enrollment = enrollments.courses[id] ?? null
  const enrolled = Boolean(enrollment)

  const title = tree?.title ?? entry?.title ?? sentenceCase(id)
  const summary = tree?.summary || entry?.summary || ''

  useBreadcrumbs([WORKSPACE_CRUMB, EXPLORE_CRUMB, { label: title }])

  if (treeLoading || catalogLoading) return <CourseSkeleton />

  const topics = tree?.topics ?? []
  const nextTopic = tree ? nextTopicOf(tree, context) : null

  const openDialog = () => setDialogOpen(true)
  const handleEnroll = ({ goal, examDate }) => {
    saveEnrollment(userId, id, { goal, examDate })
    setDialogOpen(false)
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: flashState('Added to My courses', title),
    })
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={summary || 'This course has no summary yet.'}
        actions={
          <>
            {enrolled ? (
              <>
                <Badge tone="primary" label="Enrolled" />
                <StartPracticeButton
                  courseId={id}
                  scope="course"
                  level={level}
                  label={nextTopic ? `Continue: ${sentenceCase(nextTopic.title)}` : 'Start practice'}
                />
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={openDialog}>
                  Enroll
                </Button>
                <StartPracticeButton
                  courseId={id}
                  scope="course"
                  level={level}
                  enroll
                  label="Start practice"
                />
              </>
            )}
          </>
        }
      />

      {topics.length === 0 ? (
        <PanelLarge>
          <EmptyState
            icon={entry ? IconLearning : IconSearch}
            title={entry ? 'No practice questions yet' : 'We could not find that course'}
            description={
              entry
                ? `${entry.title} is in the catalog, but none of its questions have been written yet. Practice and progress start working as soon as they are.`
                : 'The catalog has no course with this address. It may have been renamed, or the link may be out of date.'
            }
          />
        </PanelLarge>
      ) : (
        <>
          <CourseTabs courseId={id} />
          <div className="mt-6">
            <Outlet
              context={{
                courseId: id,
                userId,
                tree,
                entry,
                topics,
                level,
                setLevel,
                enrollment,
                enrolled,
                ...context,
              }}
            />
          </div>
        </>
      )}

      <EnrollDialog
        open={dialogOpen}
        courseTitle={title}
        onClose={() => setDialogOpen(false)}
        onEnroll={handleEnroll}
      />
    </div>
  )
}
