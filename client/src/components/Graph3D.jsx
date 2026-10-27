// "This is you" 3D constellation (Frontend-Design/07-prelude-step2 Graph3D.jsx, plan 30 S6), lazy-loaded so three.js
// never blocks first paint. Encoding: size = importance · opacity = confidence · hollow ring + lock = private ·
// dashed = contradiction. Intro: grows 0.6 → 1 (900 ms, ease-out cubic); slow auto-rotate stops on the first touch.
import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, ContactShadows, Html, Line, OrbitControls } from '@react-three/drei'
import { Lock } from 'lucide-react'
import { lighten } from '../lib/graph'

function Intro({ children }) {
  const g = useRef(null), t0 = useRef(null)
  useFrame(({ clock }) => {
    if (!g.current) return
    if (t0.current == null) t0.current = clock.elapsedTime
    const p = Math.min(1, (clock.elapsedTime - t0.current) / 0.9)
    g.current.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - p, 3)))
  })
  return <group ref={g}>{children}</group>
}

// UI polish A1: soft shadows only where the device can afford them.
const strong = () => (navigator.hardwareConcurrency ?? 4) > 4 && (navigator.deviceMemory ?? 8) >= 4

export default function Graph3D({ L, selected, onSelect, filter = 'all', query = '', mobile, paused }) {
  const [shadows] = useState(() => !mobile && strong())
  const cam = mobile ? [0, 3.6, 21] : [0, 5.2, 10.2]
  const dist = Math.hypot(...cam)
  const floorY = Math.min(-1.2, ...L.facts.map((f) => f.pos[1] - f.r), ...L.hubs.map((h) => h.pos[1] - 0.25)) - 0.6
  const [hover, setHover] = useState(null)
  const [auto, setAuto] = useState(true)
  const hubPos = Object.fromEntries(L.hubs.map((h) => [h.id, h.pos]))
  const q = query.trim().toLowerCase()
  const off = (f) => (filter !== 'all' && f.hub !== filter) || (q && !f.t.toLowerCase().includes(q))
  const hubOff = (h) => filter !== 'all' && h.id !== filter
  const sel = L.facts.find((f) => f.id === selected)
  return (
    <Canvas className="g3d" dpr={[1, 1.5]} shadows={shadows} resize={{ scroll: false, offsetSize: true }} camera={{ position: cam, fov: mobile ? 46 : 42 }}
      gl={{ antialias: true }} frameloop={paused ? 'never' : 'always'} onPointerMissed={() => setHover(null)}>
      <color attach="background" args={['#FBF8F3']} />
      {/* A1: depth. Far nodes fade into the cream (fog); warm sky / cool ground, a soft key light and a rim from behind. */}
      <fog attach="fog" args={['#FBF8F3', dist - 2.5, dist + 11]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#FFF4E6', '#C9B9A2', 0.55]} />
      <directionalLight position={[5, 8, 6]} intensity={1.05} castShadow={shadows} shadow-mapSize={[1024, 1024]} shadow-radius={6} />
      <directionalLight position={[-6, 4, -8]} intensity={0.45} color="#FFE9D6" />
      <ContactShadows position={[0, floorY, 0]} opacity={0.25} blur={2.5} scale={16} far={6} frames={90} color="#6B5F55" />
      <Intro><group rotation={[0, 0.35 + Math.PI / 8, 0]}>
        <mesh castShadow={shadows}><sphereGeometry args={[0.3, 48, 32]} /><meshStandardMaterial color="#4A3F38" roughness={0.55} metalness={0.05} /></mesh>
        <Html center position={[0, 0.58, 0]} className="g-you" zIndexRange={[20, 0]}>You</Html>
        {L.hubs.map((h) => (
          <group key={h.id}>
            <Line points={[[0, 0, 0], h.pos]} color="#C9B9A2" lineWidth={1.1} transparent opacity={hubOff(h) ? 0.25 : 0.9} />
            <mesh position={h.pos} castShadow={shadows}><sphereGeometry args={[0.25, 40, 24]} /><meshStandardMaterial color={h.tint} roughness={0.55} metalness={0.05} transparent opacity={hubOff(h) ? 0.3 : 1} /></mesh>
            <Html center position={[h.pos[0], h.pos[1] + 0.48, h.pos[2]]} className={`g-hub ${hubOff(h) ? 'off' : ''}`} zIndexRange={[20, 0]}>{h.name}</Html>
          </group>
        ))}
        {L.facts.map((f) => {
          const o = off(f), active = hover === f.id || selected === f.id
          const ev = { onPointerOver: (e) => { e.stopPropagation(); setHover(f.id); document.body.style.cursor = 'pointer' }, onPointerOut: () => { setHover(null); document.body.style.cursor = '' }, onClick: (e) => { e.stopPropagation(); onSelect?.(f.id) } }
          return (
            <group key={f.id}>
              <Line points={[hubPos[f.hub], f.pos]} color="#D9CBB3" lineWidth={0.9} transparent opacity={o ? 0.2 : 0.85} />
              {f.privacy === 'private' ? (
                <Billboard position={f.pos}>
                  <mesh {...ev}><ringGeometry args={[f.r * 0.74, f.r, 48]} /><meshBasicMaterial color={f.tint} transparent opacity={o ? 0.25 : 1} /></mesh>
                  <mesh {...ev} visible={false}><circleGeometry args={[f.r, 24]} /></mesh>
                  <Html center position={[0, 0, 0]} className="g-lock" zIndexRange={[10, 0]}><Lock size={10} strokeWidth={2.2} aria-hidden="true" /></Html>
                </Billboard>
              ) : (
                <mesh position={f.pos} {...ev} castShadow={shadows}><sphereGeometry args={[f.r, 28, 18]} /><meshStandardMaterial color={lighten(f.tint)} roughness={0.55} metalness={0.05} transparent opacity={o ? 0.12 : 0.3 + 0.7 * f.conf} /></mesh>
              )}
              {active && !o && <Html position={[f.pos[0], f.pos[1] + f.r + 0.16, f.pos[2]]} center className="g-label" zIndexRange={[30, 20]}>{f.t}</Html>}
            </group>
          )
        })}
        {L.contra.map(([a, b], i) => <Line key={i} points={[a.pos, b.pos]} color="#9A5546" lineWidth={1.4} dashed dashSize={0.09} gapSize={0.07} />)}
        {(L.links ?? []).map(([a, b, type], i) => <Line key={`l${i}`} points={[a.pos, b.pos]} color={type === 'ASSOCIATED' ? '#B08A3E' : '#6F7A4E'} lineWidth={type === 'ASSOCIATED' ? 0.8 : 1.1} transparent opacity={off(a) || off(b) ? 0.12 : 0.7} />)}
        {sel && <Billboard position={sel.pos}><mesh><ringGeometry args={[sel.r + 0.05, sel.r + 0.085, 48]} /><meshBasicMaterial color="#A2613F" /></mesh></Billboard>}
      </group></Intro>
      <OrbitControls target={mobile ? [0, -0.9, 0] : [0, -0.2, 0]} autoRotate={auto} autoRotateSpeed={0.35} enablePan={false} enableDamping minDistance={6} maxDistance={mobile ? 28 : 16} onStart={() => setAuto(false)} />
    </Canvas>
  )
}
