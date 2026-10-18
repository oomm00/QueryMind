/**
 * CourseMaterialTab — /course/:id/material.
 *
 * Study material is optional reading, kept apart from practice on purpose: it
 * sits on its own tab so nothing about it can stand between a student and a
 * question. The tab says so once, at the top.
 *
 * Every topic is listed in course order, and under it each concept shows the
 * links its content file holds (the existing card, with Mark as opened) and the
 * written lessons that link into the lesson workspace. A concept with neither
 * says so rather than hiding, so the shape of the page does not shift as
 * material is added.
 */

import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { sentenceCase } from '../../lib/text'
import { StudyMaterial } from '../../components/content/StudyMaterial'
import { PanelLarge } from '../../components/ui/Panel'
import { Badge } from '../../components/ui/Badge'
import { IconArticle, IconArrowRight } from '../../components/ui/Icons'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function ConceptMaterial({ courseId, topicId, concept }) {
  const lessons = (concept.lessons ?? []).filter((lesson) => !lesson.isPlaceholder)
  const resources = concept.resources ?? []

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-[13px] font-medium text-ink">{sentenceCase(concept.title)}</h4>
        <span className="text-[11px] tabular-nums text-muted">
          {plural(resources.length, 'link')} · {plural(lessons.length, 'written lesson')}
        </span>
      </div>

      <div className="mt-2">
        <StudyMaterial resources={resources} />
      </div>

      {lessons.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                to={`/learn/${courseId}/${topicId}/${lesson.id}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <IconArticle size={14} aria-hidden="true" />
                Written lesson: {sentenceCase(lesson.title)}
                <IconArrowRight size={13} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No written lesson yet.</p>
      )}
    </div>
  )
}

export default function CourseMaterialTab() {
  const { courseId, topics } = useOutletContext()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Study material</h2>
          <p className="mt-0.5 text-xs text-muted">Optional. Practice never depends on this.</p>
        </div>
        <Badge tone="neutral" label="Optional" />
      </div>

      <PanelLarge>
        <ol className="divide-y divide-line">
          {topics.map((topic) => (
            <li key={topic.id} className="py-4 first:pt-0 last:pb-0">
              <h3 className="text-sm font-semibold text-ink">{sentenceCase(topic.title)}</h3>
              {topic.concepts.length > 0 ? (
                <div className="mt-1 divide-y divide-line">
                  {topic.concepts.map((concept) => (
                    <ConceptMaterial
                      key={concept.id}
                      courseId={courseId}
                      topicId={topic.id}
                      concept={concept}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted">No study material added yet.</p>
              )}
            </li>
          ))}
        </ol>
      </PanelLarge>
    </div>
  )
}
