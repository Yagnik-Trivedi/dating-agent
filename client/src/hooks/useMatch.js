import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg } from '../lib/api'
import { useSocket, useSocketEvent } from './useSocket'

const REPORT_STATUSES = ['compatible', 'maybe', 'incompatible', 'flagged_fake', 'handed_off', 'closed']
const merge = (prev, incoming) => {
  const byId = new Map(prev.map((x) => [String(x._id), x]))
  incoming.forEach((x) => byId.set(String(x._id), x))
  return [...byId.values()]
}

/** Everything the match room needs, kept live over the socket: detail, messages, MY notes + chat moments, interest. */
export function useMatch(matchId) {
  const [match, setMatch] = useState(null)
  const [messages, setMessages] = useState([])
  const [facts, setFacts] = useState([])
  const [events, setEvents] = useState([])
  const [interest, setInterest] = useState(null)
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

  const loadNotes = useCallback(async () => {
    const { data } = await api.get(`/api/matches/${matchId}/kg`)
    setFacts(data.facts)
    setEvents(data.events ?? [])
    setInterest(data.interest ?? null)
  }, [matchId])

  const load = useCallback(async () => {
    setError(null)
    try {
      await Promise.all([loadDetail(), loadMessages(), loadNotes()])
    } catch (err) {
      setError(errMsg(err))
    }
  }, [loadDetail, loadMessages, loadNotes])

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
    if (REPORT_STATUSES.includes(status) || ['agent_chatting', 'evaluating'].includes(status)) loadDetail().catch(() => {})
  })

  // My agent's notes, chat moments and agenda progress, as it reads each of their messages.
  const onNotes = ({ matchId: id, facts: f = [], events: e = [], agenda }) => {
    if (!same(id)) return
    if (f.length) setFacts((prev) => merge(prev, f))
    if (e.length) setEvents((prev) => merge(prev, e))
    if (agenda) setMatch((m) => (m?.brief ? { ...m, brief: { ...m.brief, agenda } } : m))
    if (e.length || f.length) loadNotes().catch(() => {}) // picks up the interest meter too
  }
  useSocketEvent('notes:update', onNotes)
  useSocketEvent('kg:update', ({ matchId: id, agenda }) => { if (same(id) && agenda) setMatch((m) => (m?.brief ? { ...m, brief: { ...m.brief, agenda } } : m)) })

  useSocketEvent('report:ready', ({ matchId: id }) => {
    if (same(id)) loadDetail().catch(() => {})
  })

  const send = useCallback(async (text) => {
    const { data } = await api.post(`/api/matches/${matchId}/messages`, { text })
    setMessages((prev) => (prev.some((m) => m._id === data.message._id) ? prev : [...prev, data.message]))
  }, [matchId])

  const takeover = useCallback(async () => {
    setMatch((m) => ({ ...m, agentActive: false, paused: false })) // instant; the server confirms below
    const { data } = await api.post(`/api/matches/${matchId}/takeover`)
    setMatch(data.match)
  }, [matchId])

  const pause = useCallback(async () => {
    setMatch((m) => ({ ...m, agentActive: false, paused: true }))
    const { data } = await api.post(`/api/matches/${matchId}/pause`)
    setMatch(data.match)
  }, [matchId])

  const resume = useCallback(async () => {
    const { data } = await api.post(`/api/matches/${matchId}/resume`)
    setMatch(data.match)
  }, [matchId])

  const decide = useCallback(async (decision) => {
    const { data } = await api.post(`/api/matches/${matchId}/decision`, { decision })
    setMatch(data.match)
    if (data.match.status === 'handed_off') await loadMessages()
    return data.match
  }, [matchId, loadMessages])

  const extend = useCallback(async () => {
    const { data } = await api.post(`/api/matches/${matchId}/extend`)
    setMatch(data.match)
    return data.match
  }, [matchId])

  return { match, messages, facts, events, interest, typingUserId, error, reload: load, send, takeover, pause, resume, decide, extend, sendTyping }
}

/** "I wouldn't say that" on my own agent's message, optionally with how I'd say it. → { rule, kind } */
export const wouldntSay = (messageId, fix) => api.post(`/api/messages/${messageId}/wouldnt-say`, fix ? { fix } : {}).then((r) => r.data)
