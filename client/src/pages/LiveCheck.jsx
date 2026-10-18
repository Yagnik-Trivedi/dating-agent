// Plan 19 live check: 2 random moves on camera. MediaPipe runs in the browser for live guidance only; one still per move
// goes to the server, where code checks + ONE Nemotron vision call decide. Frames are never stored. Functional screen in
// the Prelude look; "Live-checked" is the only claim (never "verified").
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, Check, Lock, RefreshCw } from 'lucide-react'
import { Btn, Typing } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

// Live guidance, from face-landmark geometry measured against your own neutral frame (tune with real samples).
// yaw > 0 = you turned to YOUR right. Turns are checked by size only here; the server's vision call checks direction.
const GUIDE = { yawScale: 100, pitchScale: 200, neutralYaw: 8, turnDeg: 20, upDeg: 15, smile: 0.6, holdMs: 300, actionTimeoutMs: 15_000 }
const STEP = {
  neutral: ['Look straight at the camera', 'Keep a relaxed face, centred in the frame.'],
  turn_left: ['Turn your head to your left', 'Slowly, until we say hold.'],
  turn_right: ['Turn your head to your right', 'Slowly, until we say hold.'],
  look_up: ['Look up a little', 'Tilt your chin up, eyes on the ceiling.'],
  smile: ['Smile', 'A real, clear smile.'],
}
const FAIL = 'That didn’t work. Let’s try again.'

async function loadLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision') // lazy: only on this screen
  const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  })
}

/** Raw (unmirrored) pose from landmarks: nose offset across the face in camera space. */
function pose(res) {
  const lm = res.faceLandmarks?.[0]
  if (!lm) return null
  const nose = lm[1], left = lm[234], right = lm[454], top = lm[10], chin = lm[152]
  const w = Math.abs(right.x - left.x) || 1, h = Math.abs(chin.y - top.y) || 1
  const shapes = Object.fromEntries((res.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]))
  return {
    faces: res.faceLandmarks.length,
    // You turning to YOUR right moves your nose toward the image's left (smaller x) in the raw camera frame.
    x: -(nose.x - (left.x + right.x) / 2) / w,
    y: (nose.y - top.y) / h,
    smile: ((shapes.mouthSmileLeft ?? 0) + (shapes.mouthSmileRight ?? 0)) / 2,
  }
}

/** One JPEG of the raw (unmirrored) video, ≤ 640 px and ≤ 120 KB. → base64 */
async function grab(video) {
  const scale = Math.min(1, 640 / video.videoWidth)
  const c = document.createElement('canvas')
  c.width = Math.round(video.videoWidth * scale); c.height = Math.round(video.videoHeight * scale)
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
  for (const q of [0.8, 0.65, 0.5]) {
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    if (blob.size <= 120 * 1024) {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(s)
    }
  }
  throw new Error('frame too large')
}

export default function LiveCheck() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('consent') // consent · loading · camera · sending · passed · failed · nocam
  const [agree, setAgree] = useState(false)
  const [step, setStep] = useState(0)
  const [actions, setActions] = useState([])
  const [hint, setHint] = useState('')
  const [held, setHeld] = useState(false)
  const video = useRef(null)
  const stopRef = useRef(() => {})

  useEffect(() => () => stopRef.current(), [])

  async function run() {
    setPhase('loading'); setHint('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
    } catch {
      setPhase('nocam'); return
    }
    let alive = true
    const stopAll = () => { alive = false; stream.getTracks().forEach((t) => t.stop()) }
    stopRef.current = stopAll
    try {
      const [landmarker, challenge] = await Promise.all([loadLandmarker(), api.post('/api/live-check/start').then((r) => r.data)])
      setActions(challenge.actions)
      video.current.srcObject = stream
      await video.current.play()
      setPhase('camera')
      const frames = [], timeline = []
      let base = null, i = 0, since = null, stepStart = performance.now(), lastT = 0
      const ok = (a, p) => {
        const yaw = base ? (p.x - base.x) * GUIDE.yawScale : p.x * GUIDE.yawScale
        const pitch = base ? (base.y - p.y) * GUIDE.pitchScale : 0
        return { yaw, pitch, pass: {
          neutral: Math.abs(yaw) < GUIDE.neutralYaw,
          turn_left: Math.abs(yaw) > GUIDE.turnDeg,
          turn_right: Math.abs(yaw) > GUIDE.turnDeg,
          look_up: pitch > GUIDE.upDeg,
          smile: p.smile > GUIDE.smile,
        }[a] }
      }
      await new Promise((resolve, reject) => {
        const tick = async () => {
          if (!alive) return reject(new Error('stopped'))
          const now = performance.now()
          const res = landmarker.detectForVideo(video.current, now)
          const p = pose(res)
          const a = challenge.actions[i]
          if (p) {
            const { yaw, pitch, pass } = ok(a, p)
            if (now - lastT >= 100 && timeline.length < 300) { timeline.push({ t: Date.now(), yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10, smile: Math.round(p.smile * 100) / 100 }); lastT = now }
            const good = pass && p.faces === 1
            setHeld(good)
            if (good) {
              since ??= now
              if (now - since >= GUIDE.holdMs) {
                frames.push({ action: a, capturedAt: Date.now(), jpegBase64: await grab(video.current) })
                if (a === 'neutral') base = p
                i++; since = null; stepStart = now; setStep(i); setHeld(false)
                if (i === challenge.actions.length) return resolve()
              }
            } else since = null
          }
          if (now - stepStart > GUIDE.actionTimeoutMs) return reject(new Error('timeout'))
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      stopAll()
      setPhase('sending')
      const { data } = await api.post('/api/live-check/finish', { challengeId: challenge.challengeId, nonce: challenge.nonce, frames, timeline })
      if (data.result === 'passed') { await refresh(); setPhase('passed') } else { setHint(data.hint ?? FAIL); setPhase('failed') }
    } catch (err) {
      stopAll()
      setHint(err.message === 'timeout' ? 'That step took too long. Try again and hold each move for a moment.' : err.message === 'stopped' ? '' : errMsg(err))
      setPhase('failed')
    }
  }

  const a = actions[step]
  return (
    <div className="page live">
      <header className="page-head"><div><h1 className="t-h1">Live check</h1><p>Two quick moves on camera show you’re a real person. It doesn’t check your photos or your ID.</p></div></header>

      {phase === 'consent' && (
        <div className="card live-card-in">
          <label className="consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span><b>Live check.</b> You’ll do 2 quick moves on camera. We take one still photo per move and send them to our AI provider (NVIDIA / Nebius) to confirm a real person did them, in order. We don’t keep the photos or any face data, only the result. This shows you’re a real person. It doesn’t check your profile photos or your ID.</span>
          </label>
          <div className="v-actions" style={{ borderTop: 0, paddingTop: 0 }}><Btn icon={Camera} disabled={!agree} onClick={run}>Start the live check</Btn><Link className="text-link push" to="/settings">Not now</Link></div>
        </div>
      )}

      {['loading', 'camera', 'sending'].includes(phase) && (
        <div className="card live-stage">
          <div className="live-video"><video ref={video} playsInline muted aria-hidden="true" />
            {phase !== 'camera' && <div className="live-over"><Typing label={phase === 'loading' ? 'Starting the camera' : 'Checking'} /><p>{phase === 'loading' ? 'Starting the camera…' : 'Checking… this takes a few seconds.'}</p></div>}
          </div>
          {phase === 'camera' && a && (
            <div className="live-step" aria-live="assertive">
              <p className="t-label">Step {step + 1} of {actions.length}</p>
              <h2 className="t-h2">{STEP[a][0]}</h2>
              <p className={`small ${held ? 'live-hold' : ''}`}>{held ? 'Hold it…' : STEP[a][1]}</p>
              <ol className="live-dots">{actions.map((x, k) => <li key={x + k} className={k < step ? 'done' : k === step ? 'now' : ''}>{k < step ? <Check size={14} strokeWidth={2} /> : k + 1}</li>)}</ol>
            </div>
          )}
        </div>
      )}

      {phase === 'passed' && (
        <div className="card live-card-in"><p className="v-eyebrow"><Check size={15} strokeWidth={1.8} aria-hidden="true" />Live-checked</p>
          <h2 className="t-h2">Thanks, you’re live-checked.</h2>
          <p className="t-body muted">Your profile now shows “Live-checked”. A live camera check showed a real person made this account. It doesn’t check your photos or ID.</p>
          <div className="v-actions" style={{ borderTop: 0 }}><Btn onClick={() => navigate('/discover')}>Back to introductions</Btn></div></div>
      )}
      {phase === 'failed' && (
        <div className="card live-card-in"><h2 className="t-h2">Let’s try that again</h2><p className="t-body">{hint || FAIL}</p>
          <div className="v-actions" style={{ borderTop: 0 }}><Btn icon={RefreshCw} onClick={run}>Try again</Btn><Link className="text-link push" to="/settings">Skip for now</Link></div></div>
      )}
      {phase === 'nocam' && (
        <div className="card live-card-in"><h2 className="t-h2">We can’t use your camera</h2>
          <p className="t-body">The live check needs your front camera. If you blocked it, allow camera access for this site in your browser settings, then try again. It’s optional: everything else works without it.</p>
          <div className="v-actions" style={{ borderTop: 0 }}><Btn kind="secondary" icon={RefreshCw} onClick={run}>Try again</Btn><Link className="text-link push" to="/settings">Skip for now</Link></div></div>
      )}
      <p className="privacy-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />Photos are used only for this check and never stored. Only the result is kept.</p>
    </div>
  )
}
