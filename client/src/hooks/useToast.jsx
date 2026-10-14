import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentIcon } from '../components/ui'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((text, { to, agent = false, tone } = {}) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, text, to, agent, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const body = (
            <>
              {t.agent && <AgentIcon className="size-6 shrink-0" />}
              <span>{t.text}</span>
            </>
          )
          const cls = `pointer-events-auto animate-rise flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${
            t.tone === 'bad' ? 'border-bad/40 bg-surface text-bad' : 'border-line bg-surface text-ink'
          }`
          return t.to ? <Link key={t.id} to={t.to} className={cls}>{body}</Link> : <div key={t.id} className={cls}>{body}</div>
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
