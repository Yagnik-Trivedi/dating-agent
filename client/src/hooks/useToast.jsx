import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PenLine, ShieldAlert } from 'lucide-react'

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
      <div aria-live="polite" className="toasts">
        {toasts.map((t) => {
          const Icon = t.tone === 'bad' ? ShieldAlert : PenLine
          const body = <>{(t.agent || t.tone === 'bad') && <Icon size={18} strokeWidth={1.6} aria-hidden="true" />}<span>{t.text}</span></>
          const cls = `toast animate-rise ${t.tone === 'bad' ? 'flag' : ''}`
          return t.to ? <Link key={t.id} to={t.to} className={cls}>{body}</Link> : <div key={t.id} className={cls}>{body}</div>
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
