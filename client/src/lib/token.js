// The login token, per tab: each tab keeps its own (sessionStorage), so several accounts can be logged in at once in
// one browser, one per tab. A new tab starts from the last login (localStorage) and pins it, so a later login in another
// tab doesn't switch this one. Storage can throw (private mode, blocked site data): then nothing is remembered.
const KEY = 'token'
const read = (s) => { try { return s.getItem(KEY) } catch { return null } }
const write = (s, v) => { try { if (v) s.setItem(KEY, v); else s.removeItem(KEY) } catch { /* storage blocked */ } }

export function getToken() {
  const mine = read(sessionStorage)
  if (mine) return mine
  const last = read(localStorage)
  if (last) write(sessionStorage, last)
  return last
}

export function setToken(token) {
  write(sessionStorage, token)
  write(localStorage, token)
}

/** Log this tab out. The remembered login goes too, unless another tab has logged in since. */
export function clearToken() {
  const mine = read(sessionStorage)
  write(sessionStorage, null)
  if (!mine || read(localStorage) === mine) write(localStorage, null)
}
