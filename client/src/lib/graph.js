// "This is you" graph model (Frontend-Design/07-prelude-step2 lib/graph.js, plan 30 S6), fed with real facts from
// GET /api/kg/me. Deterministic layout: You in the centre, hubs on a gently tilted ring alternating above/below it (labels
// never stack), facts pushed outward from their hub. Encoding: size = how much it matters, opacity = how sure,
// ring + lock = private, dashed = contradiction. Capped at MAX_NODES facts.
export const MAX_NODES = 300
export const HUBS = [
  { id: 'who', name: 'Who I am', tint: '#8C7B6B' },
  { id: 'likes', name: 'Likes', tint: '#B5734F' },
  { id: 'dislikes', name: 'Dislikes', tint: '#9A5546' },
  { id: 'values', name: 'Values & lifestyle', tint: '#6F7A4E' },
  { id: 'goals', name: 'Goals', tint: '#B08A3E' },
  { id: 'stories', name: 'Stories', tint: '#7F9175' },
  { id: 'opinions', name: 'Opinions & humour', tint: '#A88C6A' },
  { id: 'voice', name: 'How I text', tint: '#6E7378' },
]
const SOURCE = { questionnaire_choice: 'Your answer, onboarding', questionnaire_story: 'Your story, onboarding', questionnaire_module: 'Your answer, Teach your agent', user_answer: 'You told your agent', own_chat: 'A chat of yours', reflection: 'Your agent noticed', agent_observed: 'From a chat' }

function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const GOLDEN = Math.PI * (3 - Math.sqrt(5)) // the golden angle, for even spreads
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l) }
const imp = (w) => (w >= 0.85 ? 3 : w >= 0.5 ? 2 : 1)

/** API graph (+ contradictions) → { hubs, facts, contra }. Facts: { id, t, hub, imp, conf, privacy, src, q, at, voice, editable, pos, r, tint } */
export function buildGraph(api, contradictions = []) {
  const r = rng(7), R = 3.1
  const present = new Set(api.nodes.filter((n) => n.hub && !n.hubNode).map((n) => n.hub))
  // UI polish A1: hubs spread over a flattened sphere (Fibonacci points), so they sit at different depths, not on one ring.
  const shown = HUBS.filter((h) => present.has(h.id))
  const hubs = shown.map((h, i, all) => {
    const y = all.length > 1 ? (1 - (i / (all.length - 1)) * 2) * 0.72 : 0 // kept off the poles, so no hub projects onto You
    const ring = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GOLDEN
    return { ...h, pos: [Math.cos(th) * ring * R * 1.15, y * R * 0.42, Math.sin(th) * ring * R * 1.15] }
  })
  const byId = Object.fromEntries(hubs.map((h) => [h.id, h]))
  const seen = {}
  const facts = api.nodes.filter((n) => n.hub && !n.hubNode && n.type !== 'self' && byId[n.hub]).slice(0, MAX_NODES).map((n, i) => {
    const h = byId[n.hub], out = norm(h.pos)
    // A1: facts fan out around their hub in 3D (a Fibonacci direction per fact, leaning outward from You).
    const k = (seen[n.hub] = (seen[n.hub] ?? 0) + 1), fy = 1 - ((k * 0.618) % 1) * 2, fr = Math.sqrt(Math.max(0, 1 - fy * fy))
    const rand = norm([Math.cos(k * GOLDEN) * fr + (r() - 0.5) * 0.3, fy, Math.sin(k * GOLDEN) * fr + (r() - 0.5) * 0.3])
    const dir = norm(out.map((o, j) => o * 0.75 + rand[j] * 1.1))
    const d = 0.8 + r() * 0.55
    const voice = n.type === 'voice'
    const level = imp(n.weight ?? 0.5)
    return {
      id: n.id, i, t: n.label, hub: n.hub, imp: level, conf: n.confidence ?? 0.6, privacy: voice ? 'public' : n.disclosure ?? 'public',
      src: voice ? 'Learned from your replies' : SOURCE[n.source] ?? 'Your answer', q: n.quote ?? null, at: n.learnedAt ?? null, voice, editable: !voice,
      dealbreaker: Boolean(n.isDealbreaker), tint: h.tint, pos: h.pos.map((p, k) => p + dir[k] * d), r: [0, 0.085, 0.12, 0.16][level],
      // Plan 33 brain map
      branch: n.branch ?? null, uncertain: Boolean(n.uncertain), current: Boolean(n.current), tier: n.tier ?? null,
    }
  })
  const fid = new Map(facts.map((f) => [f.id, f]))
  const contra = contradictions.map((c) => [fid.get(c.a.id), fid.get(c.b.id)]).filter(([a, b]) => a && b)
  // Plan 33: a follow-up under its answer, a reason, the same thing on another branch.
  const links = (api.brainLinks ?? []).map((l) => [fid.get(l.source), fid.get(l.target), l.label]).filter(([a, b]) => a && b)
  return { hubs, facts, contra, links, brain: api.brain ?? null }
}
export const LINK_WORD = { BRANCH_OF: 'More on', WHY: 'Why', ASSOCIATED: 'Also on another branch' }
export const TIER_WORD = { surface: 'Small talk', personal: 'Personal', deep: 'Deep' }
export const CONF_WORD = (c) => (c >= 0.85 ? 'Sure' : c >= 0.6 ? 'Fairly sure' : 'Unsure')
export const IMP_WORD = ['', 'A detail', 'Matters', 'Matters a lot']
/** Light tint for fact spheres: the hub colour mixed with cream. */
export function lighten(hex, k = 0.42) { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); const m = [0xF4, 0xED, 0xE1]; return '#' + c.map((v, i) => Math.round(v + (m[i] - v) * k).toString(16).padStart(2, '0')).join('') }

/** The 3D view needs WebGL and a capable device; otherwise (or with reduced motion) the 2D radial view is used. */
export function canRender3D() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
    if (!gl) return false
  } catch { return false }
  const weak = (navigator.hardwareConcurrency ?? 8) <= 2 || (navigator.deviceMemory ?? 8) <= 2
  return !weak
}
