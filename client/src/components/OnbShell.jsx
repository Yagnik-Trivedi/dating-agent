// Onboarding frame (Round 7 Step 2 design, Onboarding.jsx OnbShell): progress bar with the step name, centred content,
// footer actions (Back · Skip · Continue). Without `step` it shows only the title (Teach your agent more).
import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, Clock } from 'lucide-react'
import { Btn, IconBtn, T, Wordmark } from './r7'
import { useMobile } from './prelude'

export const ONB_STEPS = ['Basics', 'Photos', 'Prompts', 'Lifestyle and values', 'How you reply', 'Done']

/**
 * Scroll to the part of the step that still needs an answer and flash it. A text field (Field puts the id on the input)
 * flashes its frame and gets focus; a group (chips, photos, a prompt card) flashes as a whole and focuses only a
 * textarea inside it, never an unrelated input such as "Another language".
 */
function showMissing(target) {
  const el = target && document.getElementById(target)
  if (!el) return
  const field = el.matches('input, textarea')
  const box = field ? el.closest('.input, .ta') ?? el : el
  box.scrollIntoView({ behavior: 'smooth', block: 'center' })
  box.classList.remove('needs'); void box.offsetWidth; box.classList.add('needs') // restart the flash
  ;(field ? el : el.querySelector('textarea'))?.focus({ preventScroll: true })
}

/**
 * `missing` ({ text, target } or null): what still stops this step. Continue stays tappable and the footer says what's
 * missing; a tap scrolls to it (an element id) instead of silently doing nothing.
 */
export default function OnbShell({ step, title, sub, children, next = 'Continue', onNext, nextDisabled, nextLoading, nextIcon, skip, onSkip, onBack, wide, label, minutesLeft, footer = true, missing }) {
  const mobile = useMobile()
  const [tried, setTried] = useState(0)
  const n = ONB_STEPS.length
  const go = () => { if (!missing) return onNext(); setTried((t) => t + 1); showMissing(missing.target) }
  return (
    <div className={`scr app-scr onb ${mobile ? 'm' : 'd'}`}>
      <header className="onb-top">
        {mobile ? (onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : <span style={{ width: 42 }} />) : <Wordmark />}
        <div className="onb-prog" role={step ? 'progressbar' : undefined} aria-valuemin={step ? 1 : undefined} aria-valuemax={step ? n : undefined} aria-valuenow={step} aria-label={step ? `Step ${step} of ${n}: ${ONB_STEPS[step - 1]}` : undefined}>
          <span className="small">{step ? `Step ${step} of ${n} · ${ONB_STEPS[step - 1]}` : label}</span>
          {step && <div className="onb-bar"><motion.i initial={false} animate={{ width: `${(step / n) * 100}%` }} transition={T.slow} /></div>}
        </div>
        {!mobile && step && <span className="small onb-time"><Clock size={14} strokeWidth={1.8} aria-hidden="true" />{step === n ? 'All done' : `About ${minutesLeft ?? Math.max(1, 6 - step)} min left`}</span>}
      </header>
      <main className={`onb-main ${wide ? 'wide' : ''}`}>
        <h1 className="h1">{title}</h1>{sub && <p className="lead">{sub}</p>}
        <div className="onb-content">{children}</div>
      </main>
      {footer && (
        <footer className="onb-foot">
          {!mobile && onBack && <Btn kind="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>}
          {missing && <p key={tried} className={`onb-miss ${tried ? 'shake' : ''}`} role={tried ? 'alert' : 'status'}>{missing.text}</p>}
          {skip && <Btn kind="ghost" className="push-r" onClick={onSkip}>{skip}</Btn>}
          {onNext && <Btn size="lg" icon={nextIcon} disabled={nextDisabled && !missing} loading={nextLoading} className={skip || missing ? '' : 'push-r'} block={mobile} onClick={go}>{next}</Btn>}
        </footer>
      )}
    </div>
  )
}
