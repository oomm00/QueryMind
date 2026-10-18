/**
 * ConceptList — the graph's accessible alternative, and the default on a phone.
 *
 * One ordered list item per concept, in the topic's own reading order. Each item
 * carries everything the canvas draws (status as text, so it never depends on
 * colour, and the prerequisites) plus the same two next steps the side panel
 * offers. Study material appears only when the concept has some: on a phone the
 * list leads with what can be practised, and the course page's study-material
 * section is where the empty state belongs.
 */

import React from 'react'
import { Panel } from '../ui/Panel'
import { sentenceCase } from '../../lib/text'
import { statusFor, statusLine, toneClass } from './conceptStatus'
import { ConceptActions } from './ConceptActions'
import { StudyMaterial } from '../content/StudyMaterial'

export function ConceptList({
  courseId,
  topicId,
  concepts,
  masteryById = {},
  dimmedIds,
}) {
  return (
    <Panel className="p-0">
      <ol className="divide-y divide-line">
        {concepts.map((concept) => {
          const mastery = masteryById[concept.id] ?? null
          const status = statusFor(mastery)
          const StatusIcon = status.icon
          const dimmed = dimmedIds?.has(concept.id)
          const prerequisites = concept.prerequisites ?? []

          return (
            <li
              key={concept.id}
              className={`p-4 transition-opacity ${dimmed ? 'opacity-35' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <StatusIcon
                  size={15}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${toneClass(status.tone)}`}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-ink">{sentenceCase(concept.title)}</h3>
                  <p className="mt-0.5 text-[11px] text-muted">{statusLine(mastery)}</p>

                  {concept.summary && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                      {concept.summary}
                    </p>
                  )}

                  <p className="mt-2 text-[11px] leading-snug text-muted">
                    <span className="font-medium text-ink">Prerequisites: </span>
                    {prerequisites.length
                      ? prerequisites
                          .map((item) =>
                            masteryById[item.id] == null
                              ? sentenceCase(item.title)
                              : `${sentenceCase(item.title)} (${Math.round(
                                  masteryById[item.id] * 100
                                )}%)`
                          )
                          .join(', ')
                      : 'none — this concept starts the topic'}
                  </p>

                  <ConceptActions
                    courseId={courseId}
                    topicId={topicId}
                    concept={concept}
                    className="mt-3"
                  />

                  {(concept.resources ?? []).length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-[11px] font-semibold text-ink">Study material (optional)</p>
                      <StudyMaterial className="mt-1.5" resources={concept.resources} />
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

export default ConceptList
