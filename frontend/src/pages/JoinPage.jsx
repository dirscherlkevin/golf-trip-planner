import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../api/client'

export default function JoinPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    client.post(`/trips/join/${token}`)
      .then((r) => navigate(`/trips/${r.data.id}`, { replace: true }))
      .catch((err) => setError(err.response?.data?.detail || 'Could not join this trip.'))
  }, [token])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: 360, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8, color: 'var(--accent-green)' }}>⛳ Joining trip…</h2>
        {error ? (
          <>
            <p style={{ color: 'var(--accent-amber)', fontSize: 13, marginBottom: 16 }}>{error}</p>
            <button className="btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Hang tight while we add you to the trip.</p>
        )}
      </div>
    </div>
  )
}
