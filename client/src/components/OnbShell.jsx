// Onboarding frame (Round 7 Step 2 design, Onboarding.jsx OnbShell): progress bar with the step name, centred content,
// footer actions (Back · Skip · Continue). Used by the onboarding steps and the live check. Without `step` it shows
// only the title (the live check opened from Settings).
import { motion } from 'motion/react'
import { ArrowLeft, Clock } from 'lucide-react'
import { Btn, IconBtn, T, Wordmark } from './r7'
import { useMobile } from './prelude'

export const ONB_STEPS = ['Basics', 'Photos', 'Prompts', 'Lifestyle and values', 'How you reply', 'Live check', 'Done']

export default function OnbShell({ step, title, sub, children, next = 'Continue', onNext, nextDisabled, nextLoading, nextIcon, skip, onSkip, onBack, wide, label, minutesLeft, footer = true }) {
  const mobile = useMobile()
  const n = ONB_STEPS.length
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
          {skip && <Btn kind="ghost" className="push-r" onClick={onSkip}>{skip}</Btn>}
          {onNext && <Btn size="lg" icon={nextIcon} disabled={nextDisabled} loading={nextLoading} className={skip ? '' : 'push-r'} block={mobile} onClick={onNext}>{next}</Btn>}
        </footer>
      )}
    </div>
  )
}
