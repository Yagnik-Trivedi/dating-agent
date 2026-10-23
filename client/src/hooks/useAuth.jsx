import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { disconnectSocket } from '../lib/socket'
import { clearToken, getToken, setToken } from '../lib/token'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({ loading: Boolean(getToken()), user: null, profile: null, system: {} }))

  const refresh = useCallback(async () => {
    const { data } = await api.get('/api/me')
    setState({ loading: false, user: data.user, profile: data.profile, system: data.system ?? {} })
    return data
  }, [])

  const logout = useCallback(() => {
    clearToken()
    disconnectSocket()
    setState({ loading: false, user: null, profile: null, system: {} })
  }, [])

  useEffect(() => {
    if (getToken()) refresh().catch(logout)
  }, [refresh, logout])

  const value = useMemo(() => ({
    ...state,
    refresh,
    logout,
    setUser: (user) => setState((s) => ({ ...s, user })),
    setProfile: (profile) => setState((s) => ({ ...s, profile })),
    async login(email, password) {
      const { data } = await api.post('/api/auth/login', { email, password })
      setToken(data.token)
      disconnectSocket() // a tab switching accounts reconnects as the new one
      return refresh()
    },
    async signup(fields) {
      const { data } = await api.post('/api/auth/signup', fields)
      setToken(data.token)
      return refresh()
    },
  }), [state, refresh, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
