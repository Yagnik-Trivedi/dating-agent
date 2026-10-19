// Plan 19 live check in the Round 7 Step 2 design (LiveCheck.jsx): consent, camera with an oval guide and a nudging
// arrow, then the result. MediaPipe runs in the browser for live guidance only; one still per move goes to the server,
// where code checks + ONE Nemotron vision call decide. Frames are never stored. "Live-checked" only, never "verified".
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, ArrowUp, Camera, Check, CircleCheck, Info, Lock, RefreshCw, ScanFace, Smile, Sun } from 'lucide-react'
import { Check2, Dots, LiveBadge } from '../components/r7'
import OnbShell from '../components/OnbShell'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

// Live guidance, from face-landmark geometry measured against your own neutral frame (tune with real samples).
// yaw > 0 = you turned to YOUR right. Turns are checked by size only here; the server's vision call checks direction.
const GUIDE = { yawScale: 100, pitchScale: 200, neutralYaw: 8, turnDeg: 20, upDeg: 15, smile: 0.6, holdMs: 300, actionTimeoutMs: 15_000 }
const STEP = {
  neutral: ['Look straight at the camera', 'Keep a relaxed face, centred in the oval.', 'Look ahead'],
  turn_left: ['Turn your head left', 'Slowly, until the oval fills.', 'Turn left'],
  turn_right: ['Turn your head right', 'Slowly, until the oval fills.', 'Turn right'],
  look_up: ['Look up a little', 'Tilt your chin up, eyes on the ceiling.', 'Look up'],
  smile: ['Smile', 'A real, clear smile.', 'Smile'],
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
  const rm = useReducedMotion()
  const navigate = useNavigate()
  const onb = Boolean(useLocation().state?.onb) // step 6 of onboarding: pass or skip goes on to Done
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
          requestAnimationFrame(() => tick().catch(reject))
        }
        requestAnimationFrame(() => tick().catch(reject))
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
  const back = () => navigate(-1)
  const NUDGE = { turn_left: ArrowLeft, turn_right: ArrowRight, look_up: ArrowUp, smile: Smile }
  const Nudge = NUDGE[a]
  if (phase === 'consent') return (
    <OnbShell label="Live check" step={onb ? 6 : undefined} title="A quick live check" sub="Two small camera moves show that a real person made this account. It takes about 20 seconds." onBack={back}
      next="Start the camera" nextIcon={Camera} nextDisabled={!agree} onNext={run} skip="Skip for now" onSkip={() => navigate(onb ? '/welcome' : '/settings')}>
      <ul className="lc-points">
        <li><ScanFace size={20} strokeWidth={1.7} aria-hidden="true" /><span><b>What it checks:</b> that a live person is in front of the camera, doing two random moves in order.</span></li>
        <li><Info size={20} strokeWidth={1.7} aria-hidden="true" /><span><b>What it doesn’t:</b> it doesn’t check your photos or your ID.</span></li>
        <li><Lock size={20} strokeWidth={1.7} aria-hidden="true" /><span><b>Your camera:</b> one still per move goes to our AI provider (NVIDIA / Nebius) for the check, then it’s gone. We keep only the result.</span></li>
      </ul>
      <Check2 checked={agree} onChange={setAgree} required>I agree to a one-time live camera check.</Check2>
      <div className="nbox"><b>If you skip:</b> everything else works. Your profile won’t show the Live-checked badge.</div>
    </OnbShell>
  )
  if (phase === 'passed') return (
    <OnbShell label="Live check" step={onb ? 6 : undefined} title="You’re live-checked" sub="Thanks. The stills were checked and not kept; only the result is." next="Continue" onNext={() => navigate(onb ? '/welcome' : '/discover')}>
      <div className="lc-ok"><span className="lc-ok-i"><CircleCheck size={36} strokeWidth={1.5} aria-hidden="true" /></span><LiveBadge tip /></div>
      <p className="small">This badge shows on your profile. It means a real person made the account; it doesn’t confirm photos or identity.</p>
    </OnbShell>
  )
  if (phase === 'failed' || phase === 'nocam') return (
    <OnbShell label="Live check" step={onb ? 6 : undefined} title={phase === 'nocam' ? 'We can’t use your camera' : 'Let’s try that once more'} onBack={back}
      sub={phase === 'nocam' ? 'The live check needs your front camera. If you blocked it, allow camera access for this site in your browser settings.' : hint || FAIL}
      next="Try again" nextIcon={RefreshCw} onNext={run} skip="Skip for now" onSkip={() => navigate(onb ? '/welcome' : '/settings')}>
      {phase === 'failed' && <ul className="lc-points"><li><Sun size={20} strokeWidth={1.7} aria-hidden="true" /><span>Face a window or a lamp, not away from it.</span></li><li><Smile size={20} strokeWidth={1.7} aria-hidden="true" /><span>Hold the phone at eye level and move slowly.</span></li></ul>}
      <p className="small">Nothing from this attempt was kept.</p>
    </OnbShell>
  )
  // loading · camera · sending
  return (
    <OnbShell label="Live check" step={onb ? 6 : undefined} title={phase === 'camera' && a ? STEP[a][0] : phase === 'sending' ? 'Checking…' : 'Starting the camera…'}
      sub={phase === 'camera' && a ? (held ? 'Hold it…' : STEP[a][1]) : phase === 'sending' ? 'This takes a few seconds.' : 'Allow camera access if your browser asks.'} footer={false}>
      <div className="cam" aria-live="polite">
        <div className="cam-view">
          <video ref={video} playsInline muted aria-hidden="true" className="cam-video" />
          <div className="cam-oval" aria-hidden="true"><svg viewBox="0 0 220 280"><ellipse cx="110" cy="140" rx="104" ry="134" className="oval-track" /><ellipse cx="110" cy="140" rx="104" ry="134" className="oval-prog" pathLength="100" strokeDasharray={`${held ? 100 : actions.length ? Math.round((step / actions.length) * 100) : 0} 100`} /></svg></div>
          {phase === 'camera' && Nudge && <motion.span className={`cam-arrow n-${a}`} animate={rm ? {} : { x: a === 'turn_left' ? [0, -6, 0] : a === 'turn_right' ? [0, 6, 0] : 0, y: a === 'look_up' ? [0, -6, 0] : 0 }} transition={{ duration: 0.3, repeat: Infinity, repeatType: 'mirror', repeatDelay: 0.9, ease: 'easeInOut' }} aria-hidden="true"><Nudge size={28} strokeWidth={2} /></motion.span>}
          {phase !== 'camera' && <span className="cam-wait"><Dots label={phase === 'sending' ? 'Checking' : 'Starting the camera'} /></span>}
          <span className="cam-tag">Camera preview</span>
        </div>
        {actions.length > 0 && <ol className="cam-steps">{actions.map((x, k) => <li key={x + k} className={k === step ? 'now' : k < step ? 'done' : ''}><span>{k < step ? <Check size={13} strokeWidth={2.4} /> : k + 1}</span>{STEP[x][2]}{k === step && <em>now</em>}</li>)}</ol>}
        <p className="small"><Sun size={14} strokeWidth={1.8} aria-hidden="true" /> Tip: face a window or a lamp.</p>
      </div>
    </OnbShell>
  )
}
