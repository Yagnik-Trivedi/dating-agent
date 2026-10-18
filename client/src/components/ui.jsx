// The v1 component kit, re-skinned with the Prelude design (same props, so every older screen picks up the design):
// 10 px buttons (never pills), 6 px chips, the design's segmented control, calm states, no alarm red.
import { useEffect, useId, useRef } from 'react'
import { PenLine, X } from 'lucide-react'

const cx = (...c) => c.filter(Boolean).join(' ')
const KIND = { primary: 'primary', agent: 'primary', secondary: 'secondary', ghost: 'secondary', danger: 'primary danger' }

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }) {
  return (
    <button className={cx('btn', KIND[variant] ?? 'primary', size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : '', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }) {
  return <div className={cx('card ui-card', className)} {...rest}>{children}</div>
}

export function Spinner({ className = '' }) {
  return (
    <svg className={cx('ui-spin', className)} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** The design's loading state: a soft skeleton, never a spinner on its own. */
export function Loading({ label = 'Loading…' }) {
  return (
    <div className="st-body ui-loading" role="status" aria-busy="true">
      <p className="small muted">{label}</p>
      <div className="sk sk-t" /><div className="sk sk-t2" />
      {[0, 1].map((i) => <div key={i} className="sk-item"><div className="sk sk-l" /><div className="sk sk-s" /></div>)}
    </div>
  )
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div role="alert" className="form-error ui-error">
      <p>{message}</p>
      {onRetry && <button className="link-btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Field({ label, hint, error, as = 'input', className, children, ...rest }) {
  const id = useId()
  const Tag = as
  return (
    <div className={cx('field', className)}>
      <label htmlFor={id} className="field-l">{label}</label>
      {as === 'select'
        ? <select id={id} className="input" {...rest}>{children}</select>
        : <Tag id={id} className="input" aria-invalid={Boolean(error)} {...rest} />}
      {hint && !error && <span className="small">{hint}</span>}
      {error && <span className="small" style={{ color: 'var(--flag)' }}>{error}</span>}
    </div>
  )
}

export function Chip({ selected, onClick, children, className, tone = 'accent', ...rest }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cx('ui-chip', selected && 'on', tone === 'agent' && 'trust', className)} {...rest}>
      {children}
    </button>
  )
}

/** Segmented control: options [{ value, label }]. */
export function Segmented({ value, onChange, options, label, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('seg', size === 'sm' ? '' : 'wide')}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  const ref = useRef()
  useEffect(() => {
    const d = ref.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} className="ui-modal">
      {open && (
        <div className="ui-modal-in">
          <div className="card-h"><h2 className="t-h2">{title}</h2><button onClick={onClose} className="icon-btn" aria-label="Close"><X size={18} strokeWidth={1.6} /></button></div>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** The agent's mark: the design's pen (drafted by your agent). */
export function AgentIcon({ className = '' }) {
  return <PenLine className={cx('ui-agent', className)} size={18} strokeWidth={1.6} aria-hidden="true" />
}

export function Avatar({ src, name, className = '' }) {
  return src
    ? <img src={src} alt="" className={cx('ui-avatar', className)} />
    : <span className={cx('ui-avatar ph', className)}>{name?.[0] ?? '?'}</span>
}

export function ProgressBar({ value, tone = 'accent', label }) {
  return (
    <div className="ui-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={tone === 'agent' || tone === 'good' ? 'trust' : ''} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}
