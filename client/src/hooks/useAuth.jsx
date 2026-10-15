import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { disconnectSocket } from '../lib/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({ loading: Boolean(localStorage.getItem('token')), user: null, profile: null, system: {} }))

  const refresh = useCallback(async () => {
    const { data } = await api.get('/api/me')
    setState({ loading: false, user: data.user, profile: data.profile, system: data.system ?? {} })
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    disconnectSocket()
    setState({ loading: false, user: null, profile: null, system: {} })
  }, [])

  useEffect(() => {
    if (localStorage.getItem('token')) refresh().catch(logout)
  }, [refresh, logout])

  const value = useMemo(() => ({
    ...state,
    refresh,
    logout,
    setUser: (user) => setState((s) => ({ ...s, user })),
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    async login(email, password) {
      const { data } = await api.post('/api/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      return refresh()
    },
    async signup(fields) {
      const { data } = await api.post('/api/auth/signup', fields)
      localStorage.setItem('token', data.token)
      return refresh()
    },
  }), [state, refresh, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
