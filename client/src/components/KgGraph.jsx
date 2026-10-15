import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { PREDICATE_COLORS } from '../lib/kg'

const FADE_MS = 900
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * Live knowledge graph. Node objects are kept across updates so positions stay put;
 * new nodes fade + grow in. Size = weight, opacity = confidence.
 */
export default function KgGraph({ data, height = 320, label = 'Knowledge graph' }) {
  const wrap = useRef(null)
  const fg = useRef()
  const nodeCache = useRef(new Map())
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  const graph = useMemo(() => {
    const now = performance.now()
    const firstBatch = nodeCache.current.size === 0 // already-known facts appear instantly; only new ones fade in
    const nodes = data.nodes.map((n) => {
      const prev = nodeCache.current.get(n.id)
      if (prev) return Object.assign(prev, n)
      const node = { ...n, born: firstBatch ? now - FADE_MS : now }
      nodeCache.current.set(n.id, node)
      return node
    })
    return { nodes, links: data.links.map((l) => ({ ...l })) }
  }, [data])

  useEffect(() => {
    fg.current?.d3Force('charge')?.strength(-110)
    fg.current?.d3Force('link')?.distance((l) => 34 + 30 * (1 - (l.target.weight ?? 0.5)))
  }, [width])

  const colors = { ink: css('--ink') || '#2a211c', muted: css('--muted') || '#6b5f57', line: css('--line') || '#e7ddd2', surface: css('--surface') || '#fff' }

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl bg-surface-2/60" style={{ height }} role="img" aria-label={`${label}: ${data.nodes.length - 1} facts`}>
      {width > 0 && (
        <ForceGraph2D
          ref={fg}
          width={width}
          height={height}
          graphData={graph}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={120}
          autoPauseRedraw={false}
          onEngineStop={() => graph.nodes.length > 1 && fg.current?.zoomToFit(500, 48)} // a lone center node would fill the canvas
          linkColor={() => colors.line}
          linkWidth={1}
          nodeLabel={(n) => (n.center ? n.label : `${n.type}: ${n.label}${n.confidence != null ? ` · ${Math.round(n.confidence * 100)}% sure` : ''}`)}
          nodeCanvasObject={(n, ctx, scale) => {
            const appear = Math.min(1, (performance.now() - n.born) / FADE_MS)
            const ease = 1 - (1 - appear) ** 3
            const r = (n.center ? 11 : 4 + (n.weight ?? 0.5) * 7) * (0.5 + 0.5 * ease)
            ctx.globalAlpha = n.center ? 1 : ease * (0.3 + 0.7 * (n.confidence ?? 1))
            ctx.beginPath()
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = PREDICATE_COLORS[n.type] ?? PREDICATE_COLORS.background
            ctx.fill()
            if (n.center) {
              ctx.lineWidth = 3 / scale
              ctx.strokeStyle = colors.surface
              ctx.stroke()
            }
            // Big graphs: label only the center, important facts, or everything once zoomed in (hover shows the rest).
            if (!n.center && graph.nodes.length > 16 && (n.weight ?? 0) < 0.8 && scale < 2.2) {
              ctx.globalAlpha = 1
              return
            }
            const fontSize = Math.max(n.center ? 12 : 10, 0) / scale
            ctx.font = `${n.center ? 700 : 500} ${fontSize}px "Plus Jakarta Sans", sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = n.center ? colors.ink : colors.muted
            const text = n.label.length > 26 ? `${n.label.slice(0, 24)}…` : n.label
            ctx.fillText(text, n.x, n.y + r + 2 / scale)
            ctx.globalAlpha = 1
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(n.x, n.y, n.center ? 12 : 9, 0, 2 * Math.PI)
            ctx.fill()
          }}
        />
      )}
      {data.nodes.length <= 1 && (
        <p className="absolute inset-x-0 bottom-3 text-center text-xs text-muted">Facts will appear here as your agent learns.</p>
      )}
    </div>
  )
}
