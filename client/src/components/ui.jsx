import { useEffect, useId, useRef } from 'react'
import { statusInfo } from '../lib/status'

const cx = (...c) => c.filter(Boolean).join(' ')

const BUTTON = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  agent: 'bg-agent text-agent-ink hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'px-6 py-3 text-base' : size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5 text-sm',
        BUTTON[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...rest }) {
  return <div className={cx('rounded-3xl border border-line bg-surface p-5', className)} {...rest}>{children}</div>
}

export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <Spinner className="size-7 text-accent" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      <p>{message}</p>
      {onRetry && <button className="mt-2 font-semibold underline" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <AgentIcon className="size-12" />
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  )
}

const inputCls = 'w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export function Field({ label, hint, error, as = 'input', className, children, ...rest }) {
  const id = useId()
  const Tag = as
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      {as === 'select'
        ? <select id={id} className={inputCls} {...rest}>{children}</select>
        : <Tag id={id} className={cx(inputCls, as === 'textarea' && 'min-h-24 resize-y')} aria-invalid={Boolean(error)} {...rest} />}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}

export function Chip({ selected, onClick, children, className, tone = 'accent', ...rest }) {
  const on = tone === 'agent' ? 'border-agent bg-agent text-agent-ink' : 'border-accent bg-accent text-accent-ink'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition', selected ? on : 'border-line bg-surface hover:border-muted', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Segmented control: options [{ value, label }]. */
export function Segmented({ value, onChange, options, label, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-full font-medium transition',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
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
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,30rem)] rounded-3xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="p-6">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button onClick={onClose} className="-m-1 rounded-full p-1 text-muted hover:text-ink" aria-label="Close">
              <svg className="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.3 5.3a1 1 0 0 0-1.4 1.4L8.6 10l-3.7 3.3a1 1 0 1 0 1.4 1.4L10 11.4l3.7 3.3a1 1 0 0 0 1.4-1.4L11.4 10l3.7-3.3a1 1 0 0 0-1.4-1.4L10 8.6 6.3 5.3z" /></svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

const TONES = {
  agent: 'bg-agent-soft text-agent',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  muted: 'bg-surface-2 text-muted',
}

export function Badge({ tone = 'muted', size = 'sm', children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full font-semibold', size === 'lg' ? 'px-5 py-1.5 font-display text-2xl' : 'px-2.5 py-0.5 text-xs', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, agentActive }) {
  const { label, tone } = statusInfo(status, agentActive)
  return <Badge tone={tone}>{tone === 'agent' && <span className="size-1.5 rounded-full bg-current" />}{label}</Badge>
}

/** The agent's mark: a calm sage tile with a spark. */
export function AgentIcon({ className = 'size-5' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="var(--agent-soft)" />
      <path d="M16 7.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z" fill="var(--agent)" />
    </svg>
  )
}

export function Avatar({ src, name, className = 'size-10' }) {
  return src
    ? <img src={src} alt="" className={cx('shrink-0 rounded-full bg-surface-2 object-cover', className)} />
    : <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent', className)}>{name?.[0] ?? '?'}</span>
}

export function ProgressBar({ value, tone = 'accent', label }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-700', tone === 'agent' ? 'bg-agent' : tone === 'good' ? 'bg-good' : 'bg-accent')} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      <span className="typing-dot size-1.5 rounded-full bg-current" />
      <span className="typing-dot size-1.5 rounded-full bg-current" />
      <span className="typing-dot size-1.5 rounded-full bg-current" />
    </span>
  )
}
