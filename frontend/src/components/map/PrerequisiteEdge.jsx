/**
 * PrerequisiteEdge — an orthogonal edge from a prerequisite to a dependent
 * concept, with the name of the link on it.
 *
 * The label sits in a small pill filled with the surface colour, centred on the
 * path, so the line never runs through the text. The arrowhead is applied by
 * the marker on the edge itself (markerEnd), which React Flow draws at the
 * target — the dependent concept.
 */

import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import { cx } from '../../lib/cx'

export function PrerequisiteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  style,
}) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          ...style,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <span
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className={cx(
              'pointer-events-none absolute whitespace-nowrap rounded-control border border-line bg-surface px-1.5 py-0.5',
              'text-[10px] font-medium leading-none text-muted',
              data?.dimmed && 'opacity-35'
            )}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default PrerequisiteEdge
