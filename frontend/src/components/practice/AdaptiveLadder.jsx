/**
 * AdaptiveLadder — Visible level ladder for real-time adaptive progression.
 *
 * Displays the 6-rung cognitive/difficulty scale:
 * 1. Remember · Easy
 * 2. Understand · Easy
 * 3. Apply · Medium
 * 4. Analyze · Medium
 * 5. Evaluate · Hard
 * 6. Create · Hard
 *
 * Highlights the active rung, animates promotions/demotions, and surfaces:
 * - The backend reason text ("Scored 82% on Apply/Medium -> moving up...")
 * - The source badge (live / cache / bank)
 * - The provisional scoring badge when offline
 * - The score of the previous answer
 */

import React, { useEffect, useState } from 'react'
import { Badge } from '../ui/Badge'
import { BLOOM_COLORS } from '../../constants/bloomTaxonomy.js'

export const LADDER_RUNGS = [
  { index: 0, bloom: 'remember', difficulty: 'easy', bloomLabel: 'Remember', diffLabel: 'Easy' },
  { index: 1, bloom: 'understand', difficulty: 'easy', bloomLabel: 'Understand', diffLabel: 'Easy' },
  { index: 2, bloom: 'apply', difficulty: 'medium', bloomLabel: 'Apply', diffLabel: 'Medium' },
  { index: 3, bloom: 'analyze', difficulty: 'medium', bloomLabel: 'Analyze', diffLabel: 'Medium' },
  { index: 4, bloom: 'evaluate', difficulty: 'hard', bloomLabel: 'Evaluate', diffLabel: 'Hard' },
  { index: 5, bloom: 'create', difficulty: 'hard', bloomLabel: 'Create', diffLabel: 'Hard' },
]

export function getRungIndex(bloom, difficulty) {
  const b = (bloom || '').toLowerCase()
  const d = (difficulty || '').toLowerCase()
  const idx = LADDER_RUNGS.findIndex((r) => r.bloom === b && r.difficulty === d)
  return idx >= 0 ? idx : 0
}

export function AdaptiveLadder({
  currentRung = 0,
  previousRung = null,
  reason = '',
  source = '',
  evaluationMode = '',
  lastScore = null,
  isGenerating = false,
  className = '',
}) {
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState(null) // 'up' | 'down' | null

  useEffect(() => {
    if (previousRung !== null && previousRung !== currentRung) {
      setDirection(currentRung > previousRung ? 'up' : 'down')
      setAnimating(true)
      const timer = setTimeout(() => setAnimating(false), 800)
      return () => clearTimeout(timer)
    }
  }, [currentRung, previousRung])

  const activeRungObj = LADDER_RUNGS[currentRung] ?? LADDER_RUNGS[0]

  return (
    <div
      className={`rounded-panel border border-line bg-surface p-4 shadow-sm transition-all duration-300 md:p-5 ${
        animating ? (direction === 'up' ? 'ring-2 ring-success/40' : 'ring-2 ring-warning/40') : ''
      } ${className}`}
      data-testid="adaptive-ladder"
    >
      {/* Top Header: Ladder Title & Active Level indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className={`flex h-2.5 w-2.5 rounded-full ${isGenerating ? 'bg-primary animate-ping' : 'bg-primary animate-pulse'}`} aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Adaptive Level Ladder
          </h3>
          {direction === 'up' && animating && (
            <span className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-semibold bg-success-tint text-success animate-bounce">
              ↑ Promoted +1
            </span>
          )}
          {direction === 'down' && animating && (
            <span className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-semibold bg-warning-tint text-warning animate-bounce">
              ↓ Stepped down -1
            </span>
          )}
          {isGenerating && (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-primary-tint text-primary animate-pulse">
              Adapting level...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink" data-testid="adaptive-active-rung">
            {isGenerating ? (
              <>Current level: <strong className="font-semibold text-primary">{activeRungObj.bloomLabel} ({activeRungObj.diffLabel})</strong></>
            ) : (
              <>Current rung: <strong className="font-semibold text-primary">{activeRungObj.bloomLabel} ({activeRungObj.diffLabel})</strong></>
            )}
          </span>
          <span className="text-[11px] text-muted tabular-nums">
            (Rung {currentRung + 1} of 6)
          </span>
        </div>
      </div>

      {/* The 6-Step Visual Ladder */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {LADDER_RUNGS.map((rung) => {
          const isActive = rung.index === currentRung
          const isPassed = rung.index < currentRung
          const bloomColor = BLOOM_COLORS[rung.bloom] ?? '#14B8A6'

          return (
            <div
              key={rung.index}
              className={`relative flex flex-col justify-between rounded-control border p-2.5 transition-all duration-200 ${
                isActive
                  ? 'border-primary bg-primary-tint/60 ring-2 ring-primary/40 shadow-sm scale-[1.02]'
                  : isPassed
                    ? 'border-line bg-surface-raised opacity-90'
                    : 'border-line/70 bg-surface opacity-55'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  Rung {rung.index + 1}
                </span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: bloomColor }}
                  aria-hidden="true"
                />
              </div>

              <div className="mt-1.5">
                <p className={`text-xs font-semibold leading-tight ${isActive ? 'text-primary font-bold' : 'text-ink'}`}>
                  {rung.bloomLabel}
                </p>
                <p className="text-[11px] text-muted">
                  {rung.diffLabel}
                </p>
              </div>

              {isActive && (
                <div className="mt-2 flex items-center justify-center">
                  <span className={`inline-block rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-fg ${isGenerating ? 'animate-pulse' : ''}`}>
                    {isGenerating ? 'Adapting...' : 'Active'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Backend Reason & Provenance Callout */}
      <div className="mt-3.5 flex flex-col gap-2.5 rounded-control border border-line bg-surface-raised p-3">
        {(reason || isGenerating) && (
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-primary mt-0.5" aria-hidden="true">💡</span>
            <p
              data-testid="adaptive-reason"
              className="text-xs sm:text-sm font-medium leading-relaxed text-ink"
            >
              {reason || (isGenerating ? `Calculating your next adaptive question based on ${activeRungObj.bloomLabel} performance...` : '')}
            </p>
          </div>
        )}

        {/* Metadata Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
          {source && (
            <Badge
              tone={source === 'live' ? 'primary' : 'neutral'}
              label={source === 'live' ? 'Live LLM question' : source === 'cache' ? 'Cached question' : 'Question bank'}
            />
          )}

          {evaluationMode === 'provisional' && (
            <Badge
              tone="warning"
              label="Provisional scoring"
            />
          )}

          {lastScore !== null && lastScore !== undefined && (
            <Badge
              tone={lastScore >= 0.75 ? 'success' : lastScore < 0.4 ? 'danger' : 'warning'}
              label={`Last answer: ${Math.round(lastScore * 100)}%`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default AdaptiveLadder
