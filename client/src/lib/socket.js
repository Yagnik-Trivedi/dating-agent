import { io } from 'socket.io-client'
import { getToken } from './token'

// UI polish B8: REST goes through the site itself (/api rewrite on Vercel), but Vercel rewrites can't carry WebSockets,
// so live updates connect straight to the API host (VITE_SOCKET_URL). If an ad blocker cancels that host, we switch
// once to long-polling through the same-site /socket.io rewrite. Listeners live here, so the switch keeps them all.
const DIRECT = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || undefined
const FAILS_BEFORE_FALLBACK = 2

const listeners = new Map() // event → Set(fn)
let real
let fails = 0
let fellBack = false

function connect(url, opts) {
  real = io(url, { auth: (cb) => cb({ token: getToken() }), ...opts }) // this tab's login (lib/token.js)
  for (const [event, fns] of listeners) for (const fn of fns) real.on(event, fn)
  real.on('connect', () => { fails = 0 })
  real.on('connect_error', () => {
    if (fellBack || !DIRECT || ++fails < FAILS_BEFORE_FALLBACK) return
    fellBack = true
    const old = real
    old.removeAllListeners()
    old.disconnect()
    connect(undefined, { transports: ['polling'] }) // same origin: /socket.io → the API, via the Vercel rewrite
  })
}

const socket = {
  on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); real?.on(event, fn); return socket },
  off(event, fn) { listeners.get(event)?.delete(fn); real?.off(event, fn); return socket },
  emit(...args) { real?.emit(...args); return socket },
  get connected() { return Boolean(real?.connected) },
}

export function getSocket() {
  if (!real) connect(DIRECT, {})
  return socket
}

export function disconnectSocket() {
  real?.removeAllListeners()
  real?.disconnect()
  real = undefined
  fails = 0
  fellBack = false
}
