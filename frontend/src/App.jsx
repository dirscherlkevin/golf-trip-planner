import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import TripRoom from './pages/TripRoom'
import JoinPage from './pages/JoinPage'
import SharePage from './pages/SharePage'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  useEffect(() => {
    if (useAuthStore.getState().token) fetchMe()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/trips/:id" element={<PrivateRoute><TripRoom /></PrivateRoute>} />
      <Route path="/join/:token" element={<PrivateRoute><JoinPage /></PrivateRoute>} />
      <Route path="/share/:id" element={<SharePage />} />
    </Routes>
  )
}
