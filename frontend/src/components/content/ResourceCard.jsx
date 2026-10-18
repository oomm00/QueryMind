/**
 * ResourceCard — one piece of study material.
 *
 * Study material is optional, so the card does the two things a reading link
 * needs and nothing more: it opens in a new tab (a student should never lose
 * their place in a session), and it can be marked as opened so the list can
 * show what has been looked at. Nothing about the card blocks practice.
 *
 * Every field comes from the content file: the title, the provider, the
 * licence and the date a human last checked the link are shown as authored.
 */

import React from 'react'
import { sentenceCase } from '../../lib/text'
import { isResourceOpened, toggleResourceOpened } from '../../content/studyMaterial.js'
import {
  IconArticle,
  IconBook,
  IconCheck,
  IconDocs,
  IconExternalLink,
  IconInteractive,
  IconNotes,
  IconVideo,
} from '../ui/Icons'

const TYPE_ICONS = {
  article: IconArticle,
  video: IconVideo,
  book: IconBook,
  docs: IconDocs,
  interactive: IconInteractive,
  notes: IconNotes,
}

export const RESOURCE_TYPE_LABELS = {
  article: 'Article',
  video: 'Video',
  book: 'Book',
  docs: 'Documentation',
  interactive: 'Interactive',
  notes: 'Notes',
}

export function ResourceCard({ resource, className }) {
  const opened = isResourceOpened(resource?.url)
  const TypeIcon = TYPE_ICONS[resource?.type] ?? IconArticle
  const typeLabel = RESOURCE_TYPE_LABELS[resource?.type] ?? sentenceCase(resource?.type ?? '')
  const minutes = Number(resource?.estMinutes)

  return (
    <li className={`rounded-panel border border-line bg-surface-raised p-3 ${className ?? ''}`}>
      <div className="flex items-start gap-2.5">
        <TypeIcon size={16} className="mt-0.5 shrink-0 text-muted" />

        <div className="min-w-0 flex-1">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span>{resource.title}</span>
            <IconExternalLink size={12} className="mt-0.5 shrink-0" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>

          <p className="mt-0.5 text-[11px] text-muted">
            {[typeLabel, resource.provider, Number.isFinite(minutes) ? `${minutes} min` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {resource.why && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{resource.why}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {[resource.license, resource.verifiedOn ? `link checked ${resource.verifiedOn}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>

            <button
              type="button"
              aria-pressed={opened}
              onClick={() => toggleResourceOpened(resource.url)}
              className="inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {opened && <IconCheck size={12} className="text-success" />}
              {opened ? 'Marked as opened' : 'Mark as opened'}
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

export default ResourceCard
