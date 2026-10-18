/**
 * ConceptMiniMap — a concept with the neighbours it is connected to.
 *
 * Left: the concept's prerequisites that live in this topic. Middle: the concept
 * itself. Right: the concepts in this topic that require it. Every box carries
 * the concept's status as text, so the picture never depends on colour, and each
 * box is a button when the caller can act on a click.
 *
 * Only connections inside the topic are drawn, the same ones the knowledge graph
 * draws; a prerequisite living in another topic stays a link in the panel's
 * prerequisite list. A concept with no neighbours says so rather than showing an
 * empty frame.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { statusFor, statusLine } from './conceptStatus'
import { sentenceCase } from '../../lib/text'

const WIDTH = 340
const NODE_W = 96
const NODE_H = 38
const ROW_H = 48
const GAP = 8
const COL = {
  left: GAP,
  middle: GAP + NODE_W + GAP * 3,
  right: GAP + (NODE_W + GAP * 3) * 2,
}

const TONE_STROKE = {
  success: 'var(--success)',
  primary: 'var(--primary)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--line-strong)',
}

const TONE_FILL = {
  primary: 'var(--primary-tint)',
}

/** SVG has no ellipsis, so long titles are cut by hand. */
function clip(text, max = 12) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * The status in the space a 96px box has: the label, then the figure. The long
 * form ("Learning · 70% estimated mastery") is what the panel and the list use.
 */
function compactStatus(value) {
  if (value == null || Number.isNaN(value)) return 'No estimate'
  return `${statusFor(value).label} · ${Math.round(value * 100)}%`
}

function Node({ x, y, title, estimate, emphasis, interactive, onActivate, ariaLabel }) {
  const status = statusFor(estimate?.value ?? null)
  const stroke = TONE_STROKE[status.tone] ?? TONE_STROKE.neutral
  const fill = emphasis ? TONE_FILL.primary ?? 'var(--primary-tint)' : 'var(--surface-2)'

  const handlers = interactive
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: onActivate,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onActivate()
          }
        },
      }
    : {}

  return (
    <g
      {...handlers}
      aria-label={ariaLabel}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
      className={interactive ? 'focus-visible:outline-none' : undefined}
    >
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={8}
        fill={fill}
        stroke={emphasis ? 'var(--primary)' : stroke}
        strokeWidth={emphasis ? 1.5 : 1}
      />
      <circle cx={x + 11} cy={y + 13} r={3.5} fill={stroke} />
      <text
        x={x + 20}
        y={y + 17}
        fontSize={11}
        fontWeight={emphasis ? 600 : 500}
        fill="var(--ink)"
      >
        {clip(sentenceCase(title))}
      </text>
      <text x={x + 11} y={y + 30} fontSize={9} fill="var(--muted)">
        {compactStatus(estimate?.value ?? null)}
      </text>
    </g>
  )
}

function Curve({ fromX, fromY, toX, toY, markerId }) {
  const bend = Math.max(12, (toX - fromX) / 2)
  return (
    <path
      d={`M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`}
      fill="none"
      stroke="var(--line-strong)"
      strokeWidth={1}
      markerEnd={`url(#${markerId})`}
    />
  )
}

export function ConceptMiniMap({
  concepts = [],
  concept,
  estimatesById = {},
  onSelect,
  graphTo,
  className,
}) {
  if (!concept) return null

  const prerequisites = (concept.prerequisites ?? []).filter((item) =>
    concepts.some((candidate) => candidate.id === item.id)
  )
  const dependents = concepts.filter(
    (candidate) =>
      candidate.id !== concept.id &&
      (candidate.prerequisites ?? []).some((item) => item.id === concept.id)
  )

  const rows = Math.max(prerequisites.length, 1, dependents.length)
  const height = rows * ROW_H + GAP
  const middleY = ((rows - 1) / 2) * ROW_H + GAP / 2
  const boxY = (row) => row * ROW_H + GAP / 2
  const centreY = (y) => y + NODE_H / 2
  const activate = (id) => (onSelect ? () => onSelect(id) : undefined)
  const connected = prerequisites.length + dependents.length
  // One marker per concept, so two mini maps on a page cannot share an id.
  const markerId = `concept-mini-map-arrow-${concept.id}`

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        height={height}
        role="group"
        aria-label={`${sentenceCase(concept.title)} and the concepts in this topic connected to it`}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
          </marker>
        </defs>

        {prerequisites.map((item, index) => {
          const y = boxY(index)
          return (
            <g key={`prereq-${item.id}`}>
              <Curve
                fromX={COL.left + NODE_W}
                fromY={centreY(y)}
                toX={COL.middle}
                toY={centreY(middleY)}
                markerId={markerId}
              />
              <Node
                x={COL.left}
                y={y}
                title={item.title}
                estimate={estimatesById[item.id]}
                interactive={Boolean(onSelect)}
                onActivate={activate(item.id)}
                ariaLabel={`${sentenceCase(item.title)}, prerequisite. ${statusLine(
                  estimatesById[item.id]?.value ?? null
                )}.`}
              />
            </g>
          )
        })}

        <Node
          x={COL.middle}
          y={middleY}
          title={concept.title}
          estimate={estimatesById[concept.id]}
          emphasis
          ariaLabel={`${sentenceCase(concept.title)}, this concept. ${statusLine(
            estimatesById[concept.id]?.value ?? null
          )}.`}
        />

        {dependents.map((item, index) => {
          const y = boxY(index)
          return (
            <g key={`dependent-${item.id}`}>
              <Curve
                fromX={COL.middle + NODE_W}
                fromY={centreY(middleY)}
                toX={COL.right}
                toY={centreY(y)}
                markerId={markerId}
              />
              <Node
                x={COL.right}
                y={y}
                title={item.title}
                estimate={estimatesById[item.id]}
                interactive={Boolean(onSelect)}
                onActivate={activate(item.id)}
                ariaLabel={`${sentenceCase(item.title)}, requires this concept. ${statusLine(
                  estimatesById[item.id]?.value ?? null
                )}.`}
              />
            </g>
          )
        })}
      </svg>

      <p className="mt-1 text-[11px] leading-snug text-muted">
        {connected === 0
          ? 'Nothing in this topic is connected to this concept yet.'
          : `${prerequisites.length} prerequisite${
              prerequisites.length === 1 ? '' : 's'
            } and ${dependents.length} dependent${dependents.length === 1 ? '' : 's'} in this topic.`}
      </p>

      {graphTo && (
        <Link to={graphTo} className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
          Open full graph
        </Link>
      )}
    </div>
  )
}

export default ConceptMiniMap
