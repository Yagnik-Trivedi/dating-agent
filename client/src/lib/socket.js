import { io } from 'socket.io-client'
import { getToken } from './token'

let socket

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      auth: (cb) => cb({ token: getToken() }), // this tab's login (lib/token.js)
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = undefined
}
