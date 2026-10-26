// App-wide toasts in the design's stack (AnimatePresence popLayout, 200 ms, calm dark pills).
// toast(text, { to, agent, tone, action, onAction }): `to` opens a page; `onAction` runs a callback (e.g. Undo) and closes it.
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PenLine, ShieldAlert } from 'lucide-react'
import { Toasts } from '../components/r7'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const toast = useCallback((text, { to, agent = false, tone, action, onAction } = {}) => {
    const id = Math.random().toString(36).slice(2)
    const icon = tone === 'bad' ? ShieldAlert : agent ? PenLine : undefined
    const run = onAction ? () => { setToasts((t) => t.filter((x) => x.id !== id)); onAction() } : to ? () => navigate(to) : undefined
    setToasts((t) => [...t.slice(-2), { id, text, icon, action: run ? action ?? 'Open' : undefined, onAction: run }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [navigate])
  const value = useMemo(() => toast, [toast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toasts items={toasts} className="app-toasts" />
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
