/**
 * TopicStudyMaterial — the study material of one topic, as the course overview
 * shows it: every concept's links, grouped by concept, behind an anchor the
 * topic row can jump to.
 *
 * The topic comes from the same hook the topic page uses, so the overview and
 * the graph can never disagree about what a topic contains. When the content
 * has no material for the topic — today, the honest state — the section says so
 * once rather than hiding.
 */

import React from 'react'
import { useTopic } from '../../hooks/useTopic'
import { sentenceCase } from '../../lib/text'
import { StudyMaterial } from './StudyMaterial'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function TopicStudyMaterial({ courseId, topic, className }) {
  const { data, isLoading } = useTopic(topic.id, courseId)

  const groups = (data?.concepts ?? [])
    .map((concept) => ({ concept, resources: concept.resources ?? [] }))
    .filter((group) => group.resources.length > 0)
  const total = groups.reduce((sum, group) => sum + group.resources.length, 0)

  return (
    <section
      id={`study-material-${topic.id}`}
      className={`scroll-mt-24 pt-4 first:pt-0 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-ink">{sentenceCase(topic.title)}</h3>
        <span className="text-[11px] tabular-nums text-muted">
          {isLoading ? 'Loading…' : total > 0 ? plural(total, 'link') : null}
        </span>
      </div>

      {isLoading ? (
        <p className="mt-1 text-[13px] text-muted">Loading study material…</p>
      ) : groups.length > 0 ? (
        <div className="mt-2 space-y-3">
          {groups.map((group) => (
            <div key={group.concept.id}>
              <p className="text-[11px] font-semibold text-muted">
                {sentenceCase(group.concept.title)}
              </p>
              <StudyMaterial className="mt-1.5" resources={group.resources} />
            </div>
          ))}
        </div>
      ) : (
        <StudyMaterial className="mt-1" resources={[]} />
      )}
    </section>
  )
}

export default TopicStudyMaterial
