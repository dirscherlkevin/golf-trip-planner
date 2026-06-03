import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [serverStatus, setServerStatus] = useState(null)
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const checkServer = async () => {
    setServerStatus('checking')
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/auth/me`)
      setServerStatus(res.status === 401 || res.ok ? 'ready' : 'error')
    } catch {
      setServerStatus('error')
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      navigate(from, { replace: true })
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setLoading(false)
        return
      }
      const detail = err.code ? `${err.code}: ${err.message}` : (err.message || 'Sign-in failed. Try again.')
      setError(detail)
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⛳</div>
        <h2 style={{ marginBottom: 4, color: 'var(--accent-green)' }}>Par-Tee Planner</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
          Golf trip planning for the crew
        </p>

        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: 8,
            fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 16 }}>{error}</p>}

        <div style={{ marginTop: 24, borderTop: '1px solid #2a2a2a', paddingTop: 16 }}>
          <button
            onClick={checkServer}
            disabled={serverStatus === 'checking'}
            style={{
              background: 'none', border: '1px solid #333', borderRadius: 6,
              color: serverStatus === 'ready' ? 'var(--accent-green)' : serverStatus === 'error' ? '#f87171' : 'var(--text-muted)',
              fontSize: 12, padding: '6px 14px', cursor: serverStatus === 'checking' ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {serverStatus === 'checking' && '⏳ Waking up server... (may take 30s)'}
            {serverStatus === 'ready' && '✅ Server is ready — try signing in!'}
            {serverStatus === 'error' && '❌ Server unreachable — try again'}
            {serverStatus === null && '🔌 Having trouble? Check / wake up server'}
          </button>
        </div>
      </div>
    </div>
  )
}
