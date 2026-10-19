// App-wide toasts in the design's stack (AnimatePresence popLayout, 200 ms, calm dark pills). toast(text, { to, agent, tone })
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PenLine, ShieldAlert } from 'lucide-react'
import { Toasts } from '../components/r7'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const toast = useCallback((text, { to, agent = false, tone, action } = {}) => {
    const id = Math.random().toString(36).slice(2)
    const icon = tone === 'bad' ? ShieldAlert : agent ? PenLine : undefined
    setToasts((t) => [...t.slice(-2), { id, text, icon, action: to ? action ?? 'Open' : undefined, onAction: to ? () => navigate(to) : undefined }])
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
