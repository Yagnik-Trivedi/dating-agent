import axios from 'axios'
import { clearToken, getToken } from './token'

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Expired/invalid session: drop the token and go to login (auth routes report their own 401s).
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && !err.config?.url?.startsWith('/api/auth') && getToken()) {
    clearToken()
    window.location.assign('/login')
  }
  return Promise.reject(err)
})

/** Human-readable message from an API error. */
export function errMsg(err) {
  if (err?.response?.data?.error?.message) return err.response.data.error.message
  if (err?.request && !err.response) return "Can't reach the server. Check your connection and try again."
  return err?.message || 'Something went wrong'
}
