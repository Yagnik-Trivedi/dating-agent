import { useCallback, useEffect, useRef } from 'react'
import { getSocket } from '../lib/socket'

/** Subscribe to a server event for the component's lifetime. */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => {
    const fn = (payload) => ref.current(payload)
    const socket = getSocket()
    socket.on(event, fn)
    return () => socket.off(event, fn)
  }, [event])
}

/** Join the match room (re-joins after reconnects) and expose a throttled typing ping. */
export function useSocket(matchId) {
  useEffect(() => {
    if (!matchId) return
    const socket = getSocket()
    const join = () => socket.emit('match:join', { matchId })
    if (socket.connected) join()
    socket.on('connect', join)
    return () => socket.off('connect', join)
  }, [matchId])

  const last = useRef(0)
  const sendTyping = useCallback(() => {
    if (!matchId || Date.now() - last.current < 2000) return
    last.current = Date.now()
    getSocket().emit('typing', { matchId })
  }, [matchId])

  return { sendTyping }
}
