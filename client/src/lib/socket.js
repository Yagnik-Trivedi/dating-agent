import { io } from 'socket.io-client'

let socket

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = undefined
}
