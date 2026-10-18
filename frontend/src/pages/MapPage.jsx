/**
 * MapPage — /map/:courseId/:topicId
 *
 * The topic knowledge graph (Figma frames "Knowledge graph — Memory Management",
 * "Knowledge graph — dark appearance" and "Knowledge graph — after paging
 * assessment").
 *
 * Header: title, how many concepts are connected, "Return to outline", a
 * concept search that highlights and centres its match, a status filter that
 * dims the concepts it excludes, "Focus on <concept>" and a graph/list switch.
 * Canvas: pan and zoom with the usual controls, a minimap, a status legend and
 * the reading-order footnote. Beside it sits the selected concept.
 *
 * Positions come from dagre (lib/graphLayout) — nothing is hand-placed — and
 * mastery is the estimate from scored practice answers (lib/mastery.js), so a
 * concept with no scored answers reads "No estimate" rather than a number.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  Panel as FlowPanel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useTopic } from '../hooks/useTopic'
import { useAuth } from '../context/AuthContext.jsx'
import { useMastery } from '../lib/masteryStore.js'
import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from '../lib/graphLayout'
import { sentenceCase } from '../lib/text'
import { ConceptList } from '../components/map/ConceptList'
import { ConceptNode } from '../components/map/ConceptNode'
import { PrerequisiteEdge } from '../components/map/PrerequisiteEdge'
import { SelectedConceptPanel } from '../components/map/SelectedConceptPanel'
import { STATUS_LIST, statusFor, toneClass } from '../components/map/conceptStatus'
import { PageHeader } from '../components/ui/PageHeader'
import { Button, buttonClasses } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { IconArrowLeft, IconExplore, IconPlus, IconSearch } from '../components/ui/Icons'

// Module scope: React Flow warns when the maps are rebuilt on every render.
const NODE_TYPES = { concept: ConceptNode }
const EDGE_TYPES = { prerequisite: PrerequisiteEdge }

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...STATUS_LIST.map((status) => ({ value: status.id, label: status.label })),
]

const EDGE_STROKE = 'var(--line-strong)'

// 1x1 connection points, kept on the middle of the card's left and right edges.
const HANDLE_SIZE = 1

const FIT_VIEW_OPTIONS = { padding: 0.18, duration: 0 }

const MINIMAP_TONE = {
  success: 'var(--success)',
  primary: 'var(--primary)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--line-strong)',
}

const CONTROL_BTN =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] px-1.5 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * Fit the whole graph, once, whenever the topic's graph is mounted.
 *
 * React Flow's `fitView` prop only fits the graph the canvas was created with;
 * this page can swap topics without remounting the canvas, so the fit is asked
 * for here instead — on mount and again for every topic change.
 */
function FitGraph({ topicId }) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    fitView(FIT_VIEW_OPTIONS)
  }, [topicId, fitView])

  return null
}

/** Centre the given concept, and keep the zoom the reader chose. */
function CanvasFocus({ targetId, nonce, positionOf }) {
  const { setCenter, getZoom } = useReactFlow()

  useEffect(() => {
    if (!targetId) return
    const point = positionOf(targetId)
    if (!point) return
    setCenter(point.x, point.y, { zoom: Math.max(getZoom(), 0.6), duration: 350 })
    // `nonce` re-centres when the same concept is chosen again.
  }, [targetId, nonce, positionOf, setCenter, getZoom])

  return null
}

function GraphControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()

  return (
    <FlowPanel position="bottom-right" className="nodrag nopan">
      <div className="flex items-center gap-0.5 rounded-control border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => zoomOut({ duration: 200 })}
          aria-label="Zoom out"
          className={CONTROL_BTN}
        >
          −
        </button>
        <span
          aria-live="polite"
          className="min-w-[42px] text-center text-[11px] tabular-nums text-muted"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomIn({ duration: 200 })}
          aria-label="Zoom in"
          className={CONTROL_BTN}
        >
          <IconPlus size={13} />
        </button>
        <button
          type="button"
          onClick={() => fitView({ duration: 300, padding: 0.18 })}
          className="ml-0.5 inline-flex h-7 items-center rounded-[6px] px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Fit view
        </button>
      </div>
    </FlowPanel>
  )
}

function StatusLegend() {
  return (
    <FlowPanel position="bottom-left" className="nodrag nopan max-w-[min(100%,520px)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control border border-line bg-surface px-3 py-2">
        <span className="text-[11px] font-medium text-muted">Status</span>
        {STATUS_LIST.map((status) => {
          const Icon = status.icon
          return (
            <span key={status.id} className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Icon size={12} className={toneClass(status.tone)} />
              {status.label}
            </span>
          )
        })}
      </div>
    </FlowPanel>
  )
}

function TopicGraph({ courseId, topicId, topic }) {
  const concepts = topic.concepts
  const { userId } = useAuth()
  const estimates = useMastery(userId)
  const theme = useDocumentTheme()
  const isNarrow = !useMediaQuery('(min-width: 768px)')

  const [view, setView] = useState(() => (isNarrow ? 'list' : 'graph'))
  // ?concept=<id> opens the graph with that concept selected — how the course
  // overview hands over the concept its card is about.
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(() => {
    const requested = searchParams.get('concept')
    return requested && concepts.some((concept) => concept.id === requested) ? requested : null
  })
  const [statusFilter, setStatusFilter] = useState('all')
  const [focusOn, setFocusOn] = useState(false)
  const [search, setSearch] = useState('')
  const [nonce, setNonce] = useState(0)

  // The list is the only workable view on a phone.
  useEffect(() => {
    setView(isNarrow ? 'list' : 'graph')
  }, [isNarrow])

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Knowledge graph' },
    { label: sentenceCase(topic.title) },
  ])

  const conceptById = useMemo(() => {
    const map = {}
    for (const concept of concepts) map[concept.id] = concept
    return map
  }, [concepts])

  const masteryByConcept = useMemo(() => {
    const map = {}
    for (const concept of concepts) {
      map[concept.id] = estimates[concept.id]?.value ?? null
    }
    return map
  }, [concepts, estimates])

  // Edges come from the concepts' own prerequisites. A prerequisite living in
  // another topic is not a node here, so it is left out of the graph (the side
  // panel still links to it).
  const edges = useMemo(
    () =>
      concepts.flatMap((concept) =>
        concept.prerequisites
          .filter((prerequisite) => conceptById[prerequisite.id])
          .map((prerequisite) => ({
            id: `${prerequisite.id}--${concept.id}`,
            source: prerequisite.id,
            target: concept.id,
            label: prerequisite.label,
          }))
      ),
    [concepts, conceptById]
  )

  const layout = useMemo(
    () =>
      layoutGraph(
        concepts.map((concept) => ({ id: concept.id })),
        edges.map((edge) => ({ source: edge.source, target: edge.target }))
      ),
    [concepts, edges]
  )

  const neighboursById = useMemo(() => {
    const map = {}
    for (const concept of concepts) map[concept.id] = { prerequisites: [], dependents: [] }
    for (const edge of edges) {
      map[edge.target]?.prerequisites.push(edge.source)
      map[edge.source]?.dependents.push(edge.target)
    }
    return map
  }, [concepts, edges])

  // "Focus on <concept>" dims everything except the selection and the concepts
  // it is directly joined to, in either direction.
  const focusIds = useMemo(() => {
    if (!selectedId) return null
    const neighbours = neighboursById[selectedId]
    return new Set([
      selectedId,
      ...(neighbours?.prerequisites ?? []),
      ...(neighbours?.dependents ?? []),
    ])
  }, [selectedId, neighboursById])

  const dimmedIds = useMemo(() => {
    const dimmed = new Set()
    for (const concept of concepts) {
      const outsideFocus = focusOn && focusIds && !focusIds.has(concept.id)
      const filteredOut =
        statusFilter !== 'all' &&
        statusFor(masteryByConcept[concept.id]).id !== statusFilter
      if (outsideFocus || filteredOut) dimmed.add(concept.id)
    }
    return dimmed
  }, [concepts, focusOn, focusIds, statusFilter, masteryByConcept])

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return []
    return concepts
      .filter((concept) => sentenceCase(concept.title).toLowerCase().includes(needle))
      .map((concept) => concept.id)
  }, [concepts, search])

  // The list has no canvas to highlight a search hit on, so an active search
  // dims the concepts it does not match instead — the same treatment the status
  // filter already gets in both views.
  const listDimmedIds = useMemo(() => {
    if (!search.trim() || matches.length === 0) return dimmedIds
    const next = new Set(dimmedIds)
    for (const concept of concepts) if (!matches.includes(concept.id)) next.add(concept.id)
    return next
  }, [dimmedIds, search, matches, concepts])

  const positionOf = useCallback(
    (id) => {
      const node = layout.nodes.find((item) => item.id === id)
      if (!node) return null
      return {
        x: node.position.x + NODE_WIDTH / 2,
        y: node.position.y + NODE_HEIGHT / 2,
      }
    },
    [layout]
  )

  const selectConcept = useCallback((id) => {
    setSelectedId(id)
    setNonce((value) => value + 1)
  }, [])

  // Searching highlights its match: the first hit is selected and centred.
  useEffect(() => {
    if (!search.trim() || matches.length === 0) return
    setSelectedId(matches[0])
    setNonce((value) => value + 1)
  }, [search, matches])

  // Arrow keys walk the edges: right/down to the next neighbour, left/up to the
  // previous one, prerequisites first, then dependents. Enter/Space select.
  const handleKeyNav = useCallback(
    (id, key) => {
      const neighbours = neighboursById[id]
      if (!neighbours) return
      const order = [...neighbours.prerequisites, ...neighbours.dependents]
      if (order.length === 0) return
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
      const next =
        step > 0 ? order[0] : order[order.length - 1]
      selectConcept(next)
      // Move the caret with the selection so the next arrow key continues here.
      window.requestAnimationFrame(() => {
        document
          .querySelector(`.react-flow__node[data-id="${next}"] [role="button"]`)
          ?.focus()
      })
    },
    [neighboursById, selectConcept]
  )

  const flowNodes = useMemo(
    () =>
      layout.nodes.map((node) => ({
        ...node,
        type: 'concept',
        draggable: false,
        // Selection is owned by this page (search, arrow keys and clicks all set
        // the same state). React Flow paints `.selected` from the node itself, so
        // the state is handed down here rather than relying on its own clicks.
        selected: node.id === selectedId,
        // dagre already knows where every card sits and how big it is, so the
        // node is handed to React Flow complete: `measured` for its size and
        // `handles` for its two connection points. React Flow can then lay out
        // every edge without measuring the DOM first, which is also what makes
        // the drawing deterministic (and would keep it correct when rendered
        // without a live layout pass).
        measured: { width: node.width, height: node.height },
        handles: [
          {
            id: 'in',
            type: 'target',
            position: Position.Left,
            x: 0,
            y: node.height / 2 - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
          },
          {
            id: 'out',
            type: 'source',
            position: Position.Right,
            x: node.width - HANDLE_SIZE,
            y: node.height / 2 - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
          },
        ],
        data: {
          concept: conceptById[node.id],
          mastery: masteryByConcept[node.id] ?? null,
          dimmed: dimmedIds.has(node.id),
          matched: matches.includes(node.id),
          onSelect: selectConcept,
          onKeyNav: handleKeyNav,
        },
      })),
    [layout, conceptById, masteryByConcept, dimmedIds, matches, selectConcept, handleKeyNav, selectedId]
  )

  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'prerequisite',
        data: {
          label: edge.label,
          dimmed: dimmedIds.has(edge.source) || dimmedIds.has(edge.target),
        },
        style: { stroke: EDGE_STROKE },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: EDGE_STROKE,
        },
      })),
    [edges, dimmedIds]
  )

  const selectedConcept = selectedId ? conceptById[selectedId] : null

  const firstLesson = useMemo(
    () => concepts.flatMap((concept) => concept.lessons).find(Boolean) ?? null,
    [concepts]
  )
  const outlineTo = firstLesson ? `/learn/${courseId}/${topicId}/${firstLesson.id}` : null

  return (
    <div className="space-y-4">
      <PageHeader
        title={sentenceCase(topic.title)}
        description={`${concepts.length} connected concepts. Follow the prerequisites, or open the written lesson for this topic.`}
        actions={
          outlineTo ? (
            <Link
              to={outlineTo}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <IconArrowLeft size={15} />
              Written lesson
            </Link>
          ) : (
            <Button variant="secondary" size="sm" disabled icon={<IconArrowLeft size={15} />}>
              Written lesson
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
          <IconSearch
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a concept"
            aria-label="Find a concept"
          />
        </div>

        <Select
          className="w-[170px]"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          options={STATUS_OPTIONS}
        />

        <Button
          variant="secondary"
          size="sm"
          disabled={!selectedConcept}
          aria-pressed={focusOn}
          onClick={() => setFocusOn((value) => !value)}
        >
          {selectedConcept
            ? `Focus on ${sentenceCase(selectedConcept.title)}`
            : 'Focus on a concept'}
        </Button>

        <div
          role="group"
          aria-label="View"
          className="ml-auto inline-flex rounded-control border border-line p-0.5"
        >
          {[
            { id: 'graph', label: 'Graph' },
            { id: 'list', label: 'List' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={
                view === option.id
                  ? 'rounded-[6px] bg-primary-tint px-3 py-1.5 text-xs font-medium text-primary'
                  : 'rounded-[6px] px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {search.trim() && matches.length === 0 && (
        <p className="text-xs text-muted">No concept matches “{search.trim()}”.</p>
      )}

      {view === 'graph' ? (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-[520px] w-full overflow-hidden rounded-panel border border-line bg-surface lg:h-[620px]">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                onNodeClick={(_, node) => selectConcept(node.id)}
                onPaneClick={() => {
                  setSelectedId(null)
                  setFocusOn(false)
                }}
                nodesDraggable={false}
                nodesConnectable={false}
                edgesFocusable={false}
                minZoom={0.3}
                maxZoom={1.6}
                colorMode={theme === 'dark' ? 'dark' : 'light'}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={18}
                  size={1}
                  color="var(--line-strong)"
                />
                <MiniMap
                  pannable
                  zoomable
                  style={{ background: 'var(--surface)' }}
                  className="rounded-panel border border-line"
                  maskColor="rgba(107, 114, 128, 0.25)"
                  nodeColor={(node) =>
                    MINIMAP_TONE[statusFor(node.data?.mastery).tone] ?? MINIMAP_TONE.neutral
                  }
                />
                <StatusLegend />
                <GraphControls />
                <FitGraph topicId={topicId} />
                <CanvasFocus targetId={selectedId} nonce={nonce} positionOf={positionOf} />
              </ReactFlow>
            </div>

            <p className="text-xs leading-relaxed text-muted">
              Arrows point from prerequisite to dependent concept. The outline remains the
              primary way to navigate lessons.
            </p>
          </div>

          <aside className="min-w-0 lg:max-w-[320px] lg:shrink-0 xl:w-[320px]">
            <SelectedConceptPanel
              courseId={courseId}
              topicId={topicId}
              topic={topic}
              concept={selectedConcept}
              estimate={selectedConcept ? estimates[selectedConcept.id] ?? null : null}
              estimatesById={estimates}
              onSelect={selectConcept}
            />
          </aside>
        </div>
      ) : (
        <ConceptList
          courseId={courseId}
          topicId={topicId}
          concepts={concepts}
          masteryById={masteryByConcept}
          dimmedIds={listDimmedIds}
        />
      )}
    </div>
  )
}

export default function MapPage() {
  const { courseId = 'os', topicId } = useParams()
  const topicQuery = useTopic(topicId, courseId)
  const topic = topicQuery.data

  if (topicQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-[520px] w-full lg:h-[620px]" />
      </div>
    )
  }

  if (topicQuery.error) {
    return (
      <ErrorState
        title="Could not load this topic"
        message={topicQuery.error.message || 'The content request failed.'}
        onRetry={() => topicQuery.refetch()}
      />
    )
  }

  if (!topic) {
    return (
      <EmptyState
        icon={IconExplore}
        title="Topic not found"
        description="This topic does not exist in the content set. It may have been renamed or removed."
        action={
          <Link to="/explore" className={buttonClasses({ size: 'sm' })}>
            Back to Explore
          </Link>
        }
      />
    )
  }

  return (
    <ReactFlowProvider>
      <TopicGraph courseId={courseId} topicId={topicId} topic={topic} />
    </ReactFlowProvider>
  )
}
