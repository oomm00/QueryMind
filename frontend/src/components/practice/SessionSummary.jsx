/**
 * SessionSummary — End-of-session adaptive practice summary.
 *
 * Shows:
 * - Questions answered
 * - Average score (%)
 * - Highest rung reached
 * - Rung history (progression over time through the adaptive ladder)
 * - Actions: "Start new practice", "Back to practice"
 */

import React from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PanelLarge } from '../ui/Panel'
import { LADDER_RUNGS } from './AdaptiveLadder.jsx'
import { IconTarget, IconArrowRight, IconSparkles } from '../ui/Icons'

export function SessionSummary({
  topic = '',
  history = [],
  onRestart,
  onExit,
}) {
  const count = history.length
  const totalScore = history.reduce((sum, item) => sum + (Number(item.score) || 0), 0)
  const averageScore = count > 0 ? Math.round((totalScore / count) * 100) : 0

  const highestRungIndex = history.reduce(
    (max, item) => Math.max(max, item.rung ?? 0),
    0
  )
  const highestRung = LADDER_RUNGS[highestRungIndex] ?? LADDER_RUNGS[0]

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="session-summary">
      {/* Header Banner */}
      <div className="rounded-panel border border-primary/30 bg-primary-tint/30 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg mb-3">
          <IconSparkles size={24} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Session Complete
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Great work practicing <strong className="text-ink font-semibold">{topic}</strong>. Here is how you progressed through the adaptive ladder.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-line bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wider font-semibold text-muted">
            Questions Answered
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
            {count}
          </p>
        </div>

        <div className="rounded-control border border-line bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wider font-semibold text-muted">
            Average Score
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {averageScore}%
          </p>
        </div>

        <div className="rounded-control border border-line bg-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wider font-semibold text-muted">
            Highest Rung Reached
          </p>
          <p className="mt-1 text-lg font-bold text-ink">
            {highestRung.bloomLabel}
            <span className="block text-xs font-normal text-muted">{highestRung.diffLabel} (Rung {highestRungIndex + 1})</span>
          </p>
        </div>
      </div>

      {/* Rung Progression History List */}
      <PanelLarge>
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">
            Adaptive Rung History
          </h2>
          <span className="text-xs text-muted">
            Ladder decisions by backend
          </span>
        </div>

        {history.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No questions recorded in this session.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-line">
            {history.map((item, index) => {
              const rung = LADDER_RUNGS[item.rung ?? 0] ?? LADDER_RUNGS[0]
              const scorePct = Math.round((Number(item.score) || 0) * 100)
              const scoreTone = scorePct >= 75 ? 'success' : scorePct < 40 ? 'danger' : 'warning'

              return (
                <li key={index} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised text-[11px] font-bold text-muted border border-line">
                        {index + 1}
                      </span>
                      <span className="text-xs font-semibold text-ink">
                        {rung.bloomLabel} ({rung.diffLabel})
                      </span>
                      <span className="text-[11px] text-muted">
                        · Rung {rung.index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge tone={scoreTone} label={`${scorePct}% score`} />
                      {item.evaluation_mode === 'provisional' && (
                        <Badge tone="warning" label="Provisional" />
                      )}
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-muted line-clamp-2">
                    {item.question?.question_text || item.question?.question}
                  </p>

                  {item.adaptive_reason && (
                    <p className="mt-1 text-[11px] text-ink/80 italic">
                      ↳ {item.adaptive_reason}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </PanelLarge>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onExit}>
          Back to practice
        </Button>
        <Button onClick={onRestart}>
          Start new practice
        </Button>
      </div>
    </div>
  )
}

export default SessionSummary
