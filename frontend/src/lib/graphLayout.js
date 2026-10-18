/**
 * graphLayout — dagre layout for the topic graph.
 *
 * Positions are never hand-placed: dagre ranks the nodes and orders them within
 * each rank, so the graph stays readable as concepts are added or re-linked.
 * Ranks run left to right because every edge reads "prerequisite -> dependent",
 * and the ranks are far enough apart (ranksep 120) that an orthogonal edge and
 * its label pill live entirely in the gap between two columns of cards.
 */

import dagre from '@dagrejs/dagre'

/** The card size the layout is computed for; ConceptNode renders to match. */
export const NODE_WIDTH = 170
export const NODE_HEIGHT = 72

const DEFAULTS = {
  rankdir: 'LR',
  nodesep: 56,
  ranksep: 120,
  marginx: 16,
  marginy: 16,
}

/**
 * Place `nodes` (each `{ id }`) around `edges` (each `{ source, target }`).
 *
 * @returns {{ nodes: Array, width: number, height: number }} nodes in the same
 * order they came in, each with `position` (top-left), `width` and `height`.
 */
export function layoutGraph(nodes, edges, options = {}) {
  const nodeWidth = options.nodeWidth ?? NODE_WIDTH
  const nodeHeight = options.nodeHeight ?? NODE_HEIGHT

  const graph = new dagre.graphlib.Graph()
  graph.setGraph({
    ...DEFAULTS,
    ...options.graph,
    rankdir: options.direction ?? options.graph?.rankdir ?? DEFAULTS.rankdir,
  })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }
  for (const edge of edges) {
    // dagre only needs the endpoints; it is told nothing about the label.
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const placed = nodes.map((node) => {
    const point = graph.node(node.id)
    // dagre gives the centre of the card; React Flow positions by top-left.
    return {
      ...node,
      width: nodeWidth,
      height: nodeHeight,
      position: {
        x: Math.round((point?.x ?? 0) - nodeWidth / 2),
        y: Math.round((point?.y ?? 0) - nodeHeight / 2),
      },
    }
  })

  const size = graph.graph()
  return {
    nodes: placed,
    width: Math.ceil(size.width ?? 0),
    height: Math.ceil(size.height ?? 0),
  }
}

export default layoutGraph
