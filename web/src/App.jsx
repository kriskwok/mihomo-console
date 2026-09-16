import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api.js'
import AppShell from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import Proxies from './pages/Proxies.jsx'
import Subscriptions from './pages/Subscriptions.jsx'
import Connections from './pages/Connections.jsx'
import Rules from './pages/Rules.jsx'
import TrafficStats from './pages/TrafficStats.jsx'
import Logs from './pages/Logs.jsx'
import ConfigEditor from './pages/ConfigEditor.jsx'
import Settings from './pages/Settings.jsx'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const session = await api('/api/auth/session')
      setUser(session.authenticated ? session : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (username, password) => {
    const session = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    setUser(session)
    return session
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, refresh, login, logout }), [user, loading, refresh, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-logo" />
        <div className="boot-line" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-logo" />
        <div className="boot-line" />
      </div>
    )
  }
  return user ? <Navigate to="/" replace /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Overview />} />
          <Route path="/proxies" element={<Proxies />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/traffic" element={<TrafficStats />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/config" element={<ConfigEditor />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
