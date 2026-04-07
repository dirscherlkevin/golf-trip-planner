import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/trips').then((r) => { setTrips(r.data); setLoading(false) })
  }, [])

  const createTrip = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const { data } = await client.post('/trips', { name: newName })
    setTrips([...trips, data])
    setNewName('')
    navigate(`/trips/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 22 }}>⛳ Golf Trip Planner</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.name}</span>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>Sign Out</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="label">Start a New Trip</div>
        <form onSubmit={createTrip} style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Trip name (e.g. Scottsdale 2025)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>Create Trip</button>
        </form>
      </div>

      <div className="label" style={{ marginBottom: 12 }}>Your Trips</div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : trips.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No trips yet — create your first one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => navigate(`/trips/${trip.id}`)}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{trip.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {trip.members.length} member{trip.members.length !== 1 ? 's' : ''} · {trip.status}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
