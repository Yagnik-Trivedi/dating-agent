import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg } from '../lib/api'
import { isDemo, startDemo } from '../lib/mock'
import { useSocket, useSocketEvent } from './useSocket'

const REPORT_STATUSES = ['compatible', 'maybe', 'incompatible', 'flagged_fake', 'handed_off', 'closed']

/** Everything the match room needs, kept live over the socket. */
export function useMatch(matchId) {
  const [match, setMatch] = useState(null)
  const [messages, setMessages] = useState([])
  const [facts, setFacts] = useState([])
  const [typingUserId, setTypingUserId] = useState(null)
  const [error, setError] = useState(null)
  const typingTimer = useRef()
  const { sendTyping } = useSocket(matchId)
  const same = (id) => String(id) === String(matchId)

  const loadDetail = useCallback(async () => {
    const { data } = await api.get(`/api/matches/${matchId}`)
    setMatch(data.match)
    return data.match
  }, [matchId])

  const loadMessages = useCallback(async () => {
    const { data } = await api.get(`/api/matches/${matchId}/messages`, { params: { limit: 100 } })
    setMessages(data.messages)
  }, [matchId])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [, , kg] = await Promise.all([loadDetail(), loadMessages(), api.get(`/api/matches/${matchId}/kg`)])
      setFacts(kg.data.facts)
      if (isDemo(matchId)) startDemo()
    } catch (err) {
      setError(errMsg(err))
    }
  }, [matchId, loadDetail, loadMessages])

  useEffect(() => { load() }, [load])

  useSocketEvent('message:new', ({ message }) => {
    if (!same(message.matchId)) return
    setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]))
    setTypingUserId((t) => (String(t) === String(message.senderId) ? null : t))
  })

  useSocketEvent('typing', ({ matchId: id, userId }) => {
    if (!same(id)) return
    setTypingUserId(userId)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setTypingUserId(null), 3500)
  })

  useSocketEvent('match:status', ({ matchId: id, status, agentActive }) => {
    if (!same(id)) return
    setMatch((m) => (m ? { ...m, status, agentActive } : m))
    if (status === 'handed_off') loadMessages().catch(() => {}) // authoredBy is revealed now
    if (REPORT_STATUSES.includes(status) || status === 'agent_chatting') loadDetail().catch(() => {})
  })

  useSocketEvent('kg:update', ({ matchId: id, facts: incoming = [], agenda }) => {
    if (!same(id)) return
    setFacts((prev) => {
      const byId = new Map(prev.map((f) => [String(f._id), f]))
      incoming.forEach((f) => byId.set(String(f._id), f))
      return [...byId.values()]
    })
    if (agenda) setMatch((m) => (m?.brief ? { ...m, brief: { ...m.brief, agenda } } : m))
  })

  useSocketEvent('report:ready', ({ matchId: id }) => {
    if (same(id)) loadDetail().catch(() => {})
  })

  const send = useCallback(async (text) => {
    const { data } = await api.post(`/api/matches/${matchId}/messages`, { text })
    setMessages((prev) => (prev.some((m) => m._id === data.message._id) ? prev : [...prev, data.message]))
  }, [matchId])

  const takeover = useCallback(async () => {
    setMatch((m) => ({ ...m, agentActive: false })) // instant; server confirms below
    const { data } = await api.post(`/api/matches/${matchId}/takeover`)
    setMatch(data.match)
  }, [matchId])

  const decide = useCallback(async (decision) => {
    const { data } = await api.post(`/api/matches/${matchId}/decision`, { decision })
    setMatch(data.match)
    if (data.match.status === 'handed_off') await loadMessages()
    return data.match
  }, [matchId, loadMessages])

  return { match, messages, facts, typingUserId, error, reload: load, send, takeover, decide, sendTyping }
}
