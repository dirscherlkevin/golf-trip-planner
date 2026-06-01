import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TripRoom from './pages/TripRoom'
import JoinPage from './pages/JoinPage'
import SharePage from './pages/SharePage'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function SpinupScreen({ slow }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', color: '#fff',
    }}>
      <div style={{ fontSize: 48, marginBottom: 20, animation: 'spin 2s linear infinite' }}>⛳</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-green)', marginBottom: 8 }}>
        Golf Trip Planner
      </div>
      {slow ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Warming up the server...
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Free hosting takes ~30s to wake up. Thanks for your patience.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const token = useAuthStore((s) => s.token)
  const [ready, setReady] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!token) { setReady(true); return }
    const slowTimer = setTimeout(() => setSlow(true), 3000)
    fetchMe().finally(() => {
      clearTimeout(slowTimer)
      setReady(true)
      setSlow(false)
    })
    return () => clearTimeout(slowTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <SpinupScreen slow={slow} />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/trips/:id" element={<PrivateRoute><TripRoom /></PrivateRoute>} />
      <Route path="/join/:token" element={<PrivateRoute><JoinPage /></PrivateRoute>} />
      <Route path="/share/:id" element={<SharePage />} />
    </Routes>
  )
}
