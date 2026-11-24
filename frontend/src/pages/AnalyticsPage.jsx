/**
 * AnalyticsPage — /analytics
 *
 * Advanced Learning Intelligence Dashboard
 * - Inspired by modern fleet/bento data systems and sleek dark UI
 * - Smooth SVG gradient area charts with labeled Y/X axes and hover tooltips
 * - Exam Readiness arc gauge
 * - Side-by-side Strong Concepts vs Focus/Weak Areas with direct "Practice this" actions
 * - Cognitive Bloom taxonomy performance breakdown
 * - Actionable "Next Best Action" study advisor
 * - Detailed evaluation history log table with status pills
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { attemptsApi, masteryApi } from '../api/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import {
  IconAnalytics,
  IconTarget,
  IconClock,
  IconLearning,
  IconPlus,
  IconCheck,
  IconAlert,
  IconSparkles,
} from '../components/ui/Icons.jsx'
import { getBloomColor } from '../constants/bloomTaxonomy.js'

const BLOOM_LEVELS = [
  { id: 'remember', label: 'Remember', difficulty: 'Easy', order: 1, color: '#38BDF8' },
  { id: 'understand', label: 'Understand', difficulty: 'Easy', order: 2, color: '#34D399' },
  { id: 'apply', label: 'Apply', difficulty: 'Medium', order: 3, color: '#FBBF24' },
  { id: 'analyze', label: 'Analyze', difficulty: 'Medium', order: 4, color: '#F97316' },
  { id: 'evaluate', label: 'Evaluate', difficulty: 'Hard', order: 5, color: '#A855F7' },
  { id: 'create', label: 'Create', difficulty: 'Hard', order: 6, color: '#EC4899' },
]

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Builds a smooth SVG cubic bezier path string from a sequence of points
 */
function buildSmoothPath(points) {
  if (!points || points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Analytics' }])

  const [history, setHistory] = useState([])
  const [masteryRecords, setMasteryRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    let active = true
    if (!userId) {
      setLoading(false)
      return
    }

    Promise.allSettled([attemptsApi.getHistory(userId), masteryApi.getMyMastery()])
      .then(([attemptsRes, masteryRes]) => {
        if (!active) return
        if (attemptsRes.status === 'fulfilled') {
          const list = Array.isArray(attemptsRes.value)
            ? attemptsRes.value
            : attemptsRes.value?.attempts ?? []
          setHistory(list)
        }
        if (masteryRes.status === 'fulfilled') {
          const recs = Array.isArray(masteryRes.value) ? masteryRes.value : []
          setMasteryRecords(recs)
        }
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load analytics')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId])

  // Chronological attempt records (oldest -> newest)
  const chronological = useMemo(() => {
    return [...history].reverse()
  }, [history])

  // Overall Statistics
  const totalAttempts = history.length
  const avgScore =
    totalAttempts > 0
      ? Math.round(
          (history.reduce((sum, h) => sum + (Number(h.score) || 0), 0) / totalAttempts) * 100
        )
      : 0

  // Topic Level Aggregation
  const topicStats = useMemo(() => {
    const map = new Map()
    for (const item of history) {
      const topic = (item.topic || 'General').trim()
      const cur = map.get(topic) || { totalScore: 0, count: 0, scores: [], lastLevel: item.bloom_level }
      const sc = Number(item.score) || 0
      cur.totalScore += sc
      cur.count += 1
      cur.scores.push(sc)
      cur.lastLevel = item.bloom_level || cur.lastLevel
      map.set(topic, cur)
    }

    // Merge with mastery records if available
    const result = []
    map.forEach((data, topic) => {
      const mastery = masteryRecords.find((m) => (m.topic || '').toLowerCase() === topic.toLowerCase())
      const avg = Math.round((data.totalScore / data.count) * 100)
      const masteryScore = mastery ? Math.round(mastery.score * 100) : avg
      const rung = mastery ? mastery.current_rung : Math.min(5, Math.floor(avg / 20))
      result.push({
        topic,
        count: data.count,
        avgScore: avg,
        masteryScore,
        rung,
        isStrong: (masteryScore >= 70 || avg >= 70) && data.count >= 2,
        isWeak: (masteryScore < 70 || avg < 70) && data.count >= 1,
        scores: data.scores,
      })
    })

    return result.sort((a, b) => b.count - a.count)
  }, [history, masteryRecords])

  const strongConcepts = useMemo(() => topicStats.filter((t) => t.isStrong), [topicStats])
  const weakConcepts = useMemo(() => topicStats.filter((t) => t.isWeak), [topicStats])

  // Bloom level breakdown
  const bloomStats = useMemo(() => {
    return BLOOM_LEVELS.map((lvl) => {
      const matching = history.filter(
        (h) => (h.bloom_level || '').toLowerCase() === lvl.id
      )
      const count = matching.length
      const avg =
        count > 0
          ? Math.round((matching.reduce((acc, c) => acc + (Number(c.score) || 0), 0) / count) * 100)
          : null
      return {
        ...lvl,
        count,
        avgScore: avg,
      }
    })
  }, [history])

  // Readiness Calculation
  const readiness = useMemo(() => {
    if (totalAttempts === 0) return 0
    const coverageFactor = Math.min(1.0, topicStats.length / 5) * 0.3
    const scoreFactor = (avgScore / 100) * 0.4
    const depthFactor = Math.min(1.0, (history.filter((h) => ['apply', 'analyze', 'evaluate', 'create'].includes((h.bloom_level || '').toLowerCase())).length) / 5) * 0.3
    return Math.round((coverageFactor + scoreFactor + depthFactor) * 100)
  }, [totalAttempts, topicStats, avgScore, history])

  // Actionable Insight
  const actionableAdvice = useMemo(() => {
    if (weakConcepts.length > 0) {
      const focus = weakConcepts[0]
      return {
        type: 'critical',
        title: `Focus Priority: ${focus.topic}`,
        text: `Average score is ${focus.avgScore}%. Practice 3 targeted questions on this topic to solidify understanding and raise your rung.`,
        actionTopic: focus.topic,
        buttonText: 'Practice this concept',
      }
    }
    if (strongConcepts.length > 0) {
      const strong = strongConcepts[0]
      return {
        type: 'success',
        title: `Strong Momentum: ${strong.topic}`,
        text: `You have achieved ${strong.masteryScore}% mastery on ${strong.topic}. Explore higher rungs or pick a new concept to expand your coverage.`,
        actionTopic: strong.topic,
        buttonText: 'Test higher difficulty',
      }
    }
    return {
      type: 'neutral',
      title: 'Begin Your Exam Readiness',
      text: 'Start a practice session in any core topic to generate diagnostic analytics and identify cognitive patterns.',
      actionTopic: 'Deadlocks',
      buttonText: 'Start practice session',
    }
  }, [weakConcepts, strongConcepts])

  // Filtered evaluation rows
  const filteredHistory = useMemo(() => {
    if (activeTab === 'high') return history.filter((h) => (Number(h.score) || 0) >= 0.7)
    if (activeTab === 'low') return history.filter((h) => (Number(h.score) || 0) < 0.5)
    return history
  }, [history, activeTab])

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto" data-testid="analytics-page">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  // Chart Dimensions & Coordinate Math
  const chartWidth = 900
  const chartHeight = 220
  const padLeft = 45
  const padRight = 30
  const padTop = 20
  const padBottom = 35
  const plotWidth = chartWidth - padLeft - padRight
  const plotHeight = chartHeight - padTop - padBottom

  const chartPoints = chronological.map((item, idx) => {
    const x =
      chronological.length === 1
        ? padLeft + plotWidth / 2
        : padLeft + (idx / (chronological.length - 1)) * plotWidth
    const scoreVal = Number(item.score) || 0
    const y = padTop + plotHeight - scoreVal * plotHeight
    return { x, y, item, idx, scorePct: Math.round(scoreVal * 100) }
  })

  const smoothCurve = buildSmoothPath(chartPoints)
  const areaPath =
    chartPoints.length > 0
      ? `${smoothCurve} L ${chartPoints[chartPoints.length - 1].x} ${padTop + plotHeight} L ${chartPoints[0].x} ${padTop + plotHeight} Z`
      : ''

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="analytics-page">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Analytics & Performance</h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full">
              Live Telemetry
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Real-time evaluation curves, cognitive taxonomy progression, and concept diagnostics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => navigate('/practice')}
            icon={<IconPlus size={16} />}
            className="bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-lg shadow-orange-500/20 border-none"
          >
            Start Practice
          </Button>
        </div>
      </div>

      {totalAttempts === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#10141E] p-12 text-center shadow-xl">
          <EmptyState
            icon={IconAnalytics}
            title="No analytics data yet"
            description="Complete practice sessions to unlock accuracy trends, mastery progression, and actionable diagnostics."
            action={
              <Button onClick={() => navigate('/practice')} icon={<IconPlus size={16} />}>
                Start practice
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Top Metrics Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Exam Readiness Arc Meter */}
            <div className="rounded-2xl border border-white/10 bg-[#10141E] p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 tracking-wide uppercase">Exam Readiness</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  {readiness >= 75 ? 'Optimal' : readiness >= 45 ? 'Developing' : 'Initiating'}
                </span>
              </div>
              <div className="my-3 flex items-center justify-center">
                <div className="relative w-36 h-20 flex items-center justify-center">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 120 70">
                    <path
                      d="M 10 65 A 50 50 0 0 1 110 65"
                      fill="none"
                      stroke="#1F2937"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 10 65 A 50 50 0 0 1 110 65"
                      fill="none"
                      stroke="url(#readinessGrad)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="157"
                      strokeDashoffset={157 - (157 * readiness) / 100}
                      className="transition-all duration-700 ease-out"
                    />
                    <defs>
                      <linearGradient id="readinessGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F97316" />
                        <stop offset="100%" stopColor="#10B981" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute bottom-0 flex flex-col items-center">
                    <span className="text-2xl font-bold text-white tracking-tight">{readiness}%</span>
                    <span className="text-[10px] text-gray-400">Composite Readiness</span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-gray-400 text-center">
                Calculated from score consistency, concept depth & volume
              </div>
            </div>

            {/* Metric 2: Average Score */}
            <div className="rounded-2xl border border-white/10 bg-[#10141E] p-5 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 tracking-wide uppercase">Evaluation Average</span>
                <IconTarget className="text-orange-400" size={18} />
              </div>
              <div className="my-2">
                <div className="text-3xl font-extrabold text-white tracking-tight">{avgScore}%</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Across all {totalAttempts} submitted answers
                </div>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-orange-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${avgScore}%` }}
                ></div>
              </div>
            </div>

            {/* Metric 3: Highest Cognitive Level */}
            <div className="rounded-2xl border border-white/10 bg-[#10141E] p-5 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 tracking-wide uppercase">Cognitive Ceiling</span>
                <IconAnalytics className="text-purple-400" size={18} />
              </div>
              <div className="my-2">
                <div className="text-2xl font-bold text-white tracking-tight">
                  {capitalize(history[0]?.bloom_level || 'Remember')}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Highest Bloom taxonomy reached
                </div>
              </div>
              <div className="flex gap-1">
                {BLOOM_LEVELS.map((lvl, i) => {
                  const active = history.some((h) => (h.bloom_level || '').toLowerCase() === lvl.id)
                  return (
                    <div
                      key={lvl.id}
                      className={`h-1.5 flex-1 rounded-full ${
                        active ? 'bg-purple-500 shadow-sm shadow-purple-500/50' : 'bg-white/10'
                      }`}
                      title={lvl.label}
                    />
                  )
                })}
              </div>
            </div>

            {/* Metric 4: Concepts Explored */}
            <div className="rounded-2xl border border-white/10 bg-[#10141E] p-5 shadow-lg flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 tracking-wide uppercase">Coverage</span>
                <IconLearning className="text-blue-400" size={18} />
              </div>
              <div className="my-2">
                <div className="text-3xl font-extrabold text-white tracking-tight">{topicStats.length}</div>
                <div className="mt-1 text-xs text-gray-400">Active topics in your curriculum</div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-white/5">
                <span>Mastered: <strong className="text-emerald-400 font-semibold">{strongConcepts.length}</strong></span>
                <span>Focus: <strong className="text-orange-400 font-semibold">{weakConcepts.length}</strong></span>
              </div>
            </div>
          </div>

          {/* Actionable Next Best Action Banner */}
          <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-[#10141E] to-[#10141E] p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex-shrink-0 mt-0.5">
                <IconSparkles size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  {actionableAdvice.title}
                </h3>
                <p className="mt-0.5 text-xs text-gray-300 max-w-2xl leading-relaxed">
                  {actionableAdvice.text}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/practice', { state: { prefilledTopic: actionableAdvice.actionTopic } })}
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium flex-shrink-0 border-none shadow-md shadow-orange-500/20"
            >
              {actionableAdvice.buttonText}
            </Button>
          </div>

          {/* Primary Visualization: Smooth Area Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#10141E] p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">Score Over Time</h2>
                  <p className="text-xs text-gray-400">
                    Evaluation score percentage across your last {chronological.length} attempts.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span>Pass (70%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                    <span>Actual</span>
                  </div>
                </div>
              </div>

            {/* SVG Chart Container */}
            <div className="relative w-full overflow-hidden">
              <svg
                className="w-full h-64 overflow-visible"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818CF8" stopOpacity="0.35" />
                    <stop offset="70%" stopColor="#818CF8" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#818CF8" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="50%" stopColor="#818CF8" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines & Labels */}
                {[1.0, 0.75, 0.5, 0.25, 0.0].map((val) => {
                  const y = padTop + plotHeight - val * plotHeight
                  const isThreshold = val === 0.7
                  return (
                    <g key={val}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartWidth - padRight}
                        y2={y}
                        stroke={isThreshold ? '#10B981' : '#1F2937'}
                        strokeWidth={isThreshold ? '1.5' : '1'}
                        strokeDasharray={isThreshold ? '4,4' : '2,3'}
                        strokeOpacity={isThreshold ? '0.7' : '0.5'}
                      />
                      <text
                        x={padLeft - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="text-[10px] fill-gray-500 font-mono"
                      >
                        {Math.round(val * 100)}%
                      </text>
                    </g>
                  )
                })}

                {/* Area Gradient Fill */}
                {areaPath && <path d={areaPath} fill="url(#scoreAreaGradient)" />}

                {/* Main Curved Line */}
                {smoothCurve && (
                  <path
                    d={smoothCurve}
                    fill="none"
                    stroke="url(#lineGrad)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Data Points */}
                {chartPoints.map((pt) => {
                  const isSelected = hoveredPoint?.idx === pt.idx
                  const isHigh = pt.scorePct >= 70
                  return (
                    <g key={pt.idx} className="cursor-pointer">
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 7 : 4.5}
                        fill={isHigh ? '#10B981' : '#F97316'}
                        stroke="#0B0F19"
                        strokeWidth="2.5"
                        className="transition-all duration-150"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  )
                })}

                {/* X-Axis Milestone Labels */}
                {chartPoints.map((pt, i) => {
                  // Show milestone labels to avoid crowding
                  const showLabel =
                    chartPoints.length <= 8 ||
                    i === 0 ||
                    i === chartPoints.length - 1 ||
                    i % Math.ceil(chartPoints.length / 6) === 0
                  if (!showLabel) return null
                  return (
                    <text
                      key={`lbl-${i}`}
                      x={pt.x}
                      y={chartHeight - 8}
                      textAnchor="middle"
                      className="text-[10px] fill-gray-500 font-mono"
                    >
                      #{i + 1}
                    </text>
                  )
                })}
              </svg>

              {/* Dynamic Interactive Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 rounded-xl border border-white/20 bg-[#161F30]/95 backdrop-blur-md px-3.5 py-2.5 shadow-2xl transition-all"
                  style={{
                    left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                    top: `${(hoveredPoint.y / chartHeight) * 100}%`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-white">Attempt #{hoveredPoint.idx + 1}</span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        hoveredPoint.scorePct >= 70
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {hoveredPoint.scorePct}%
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-300">
                    Topic: <strong className="text-white">{hoveredPoint.item.topic || 'General'}</strong>
                  </div>
                  <div className="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                    <span>Level: {capitalize(hoveredPoint.item.bloom_level)}</span>
                    <span>•</span>
                    <span>{hoveredPoint.item.submitted_at?.slice(0, 10) || 'Recent'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Daily Activity Volume Panel */}
          <div className="rounded-2xl border border-white/10 bg-[#10141E] p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Daily Activity Volume</h2>
              <p className="text-xs text-gray-400">Questions answered per calendar day.</p>
              <div className="mt-4 space-y-3">
                {Object.entries(
                  chronological.reduce((acc, h) => {
                    const day = h.submitted_at?.slice(0, 10) || 'Today'
                    acc[day] = (acc[day] || 0) + 1
                    return acc
                  }, {})
                ).map(([day, count]) => (
                  <div key={day} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span>{day}</span>
                      <span className="font-bold text-white">{count} questions</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, count * 20)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-white/5 text-[11px] text-gray-400">
              Total practice days recorded: <strong className="text-white">{new Set(chronological.map(h => h.submitted_at?.slice(0, 10) || 'Today')).size}</strong>
            </div>
          </div>
        </div>

        {/* Section: Topic Performance Breakdown */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-white">Topic Performance Breakdown</h2>
            <p className="text-xs text-gray-400">Concepts categorized by mastery depth and recommended action.</p>
          </div>
          {/* Middle Row: Strong Concepts vs Focus Areas (Side by Side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Card: 🟢 Strong Concepts */}
            <div className="rounded-2xl border border-emerald-500/20 bg-[#10141E] p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <IconCheck size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Mastered Concepts (Strong)</h3>
                      <p className="text-xs text-gray-400">High retention score & solid cognitive depth</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {strongConcepts.length} Concepts
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {strongConcepts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-500">
                      No strong concepts yet. Maintain 70%+ across 2 or more attempts to earn mastery badges.
                    </div>
                  ) : (
                    strongConcepts.map((item) => (
                      <div
                        key={item.topic}
                        className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{item.topic}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 font-medium">
                              Rung {item.rung + 1}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                            <span>Score: <strong className="text-emerald-400">{item.masteryScore}%</strong></span>
                            <span>•</span>
                            <span>{item.count} question(s)</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate('/practice', { state: { prefilledTopic: item.topic } })}
                          className="text-xs border-white/10 hover:border-emerald-500/30 hover:text-emerald-400"
                        >
                          Review
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Card: 🔴 Focus Areas (Weak Concepts) */}
            <div className="rounded-2xl border border-orange-500/20 bg-[#10141E] p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      <IconAlert size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Focus Areas (Needs Practice)</h3>
                      <p className="text-xs text-gray-400">Concepts under 70% accuracy requiring reinforcement</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    {weakConcepts.length} Areas
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {weakConcepts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-emerald-400/80">
                      Great work! No topics currently fall below the 70% threshold.
                    </div>
                  ) : (
                    weakConcepts.map((item) => (
                      <div
                        key={item.topic}
                        className="rounded-xl border border-orange-500/10 bg-orange-500/[0.02] p-3.5 flex items-center justify-between hover:bg-orange-500/[0.05] transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{item.topic}</span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500/10 text-orange-400 font-medium">
                              Rung {item.rung + 1}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                            <span>Score: <strong className="text-orange-400">{item.avgScore}%</strong></span>
                            <span>•</span>
                            <span>{item.count} attempt(s)</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => navigate('/practice', { state: { prefilledTopic: item.topic } })}
                          className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium border-none shadow-sm shadow-orange-500/20"
                        >
                          Practice this
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* Cognitive Bloom Performance Grid */}
          <div className="rounded-2xl border border-white/10 bg-[#10141E] p-6 shadow-xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Cognitive Level Progression</h2>
              <p className="text-xs text-gray-400">
                Performance breakdown across Bloom's 6 cognitive levels. Shows whether errors occur in recall vs application.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {bloomStats.map((lvl) => {
                const hasScore = lvl.avgScore !== null
                return (
                  <div
                    key={lvl.id}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{lvl.label}</span>
                        <span className="text-[10px] text-gray-400">{lvl.difficulty}</span>
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-white">
                          {hasScore ? `${lvl.avgScore}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${lvl.avgScore || 0}%`,
                            backgroundColor: lvl.color,
                          }}
                        />
                      </div>
                      <span className="mt-1 block text-[10px] text-gray-400">
                        {lvl.count} questions
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Evaluations Table */}
          <div className="rounded-2xl border border-white/10 bg-[#10141E] p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Evaluation Telemetry Log</h2>
                <p className="text-xs text-gray-400">Chronological ledger of submitted answers and adaptive scores.</p>
              </div>
              <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    activeTab === 'all' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All ({history.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('high')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    activeTab === 'high' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Pass $\ge$ 70%
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('low')}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    activeTab === 'low' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Needs Work &lt; 50%
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">Topic</th>
                    <th className="py-3 px-3">Question Excerpt</th>
                    <th className="py-3 px-3">Cognitive Level</th>
                    <th className="py-3 px-3">Score</th>
                    <th className="py-3 px-3">Evaluated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredHistory.slice(0, 15).map((item, i) => {
                    const sc = Math.round((Number(item.score) || 0) * 100)
                    const isHigh = sc >= 70
                    const isMed = sc >= 50 && sc < 70
                    return (
                      <tr key={item.id || i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-3 font-mono text-gray-500">#{history.length - i}</td>
                        <td className="py-3 px-3 font-medium text-white">{item.topic || 'General'}</td>
                        <td className="py-3 px-3 text-gray-300 max-w-xs truncate" title={item.question_text}>
                          {item.question_text || 'Evaluation question'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {capitalize(item.bloom_level || 'Remember')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              isHigh
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                : isMed
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                : 'bg-red-500/15 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {sc}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-500 font-mono text-[10px]">
                          {item.submitted_at?.slice(0, 10) || 'Today'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
