import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

  const deleteTrip = async (e, tripId) => {
    e.stopPropagation()
    setDeleting(true)
    try {
      await client.delete(`/trips/${tripId}`)
      setTrips(trips.filter(t => t.id !== tripId))
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
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
              onClick={() => confirmDelete === trip.id ? null : navigate(`/trips/${trip.id}`)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {trip.name}
                  {trip.status === 'finalized' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px',
                      background: 'var(--accent-green)', color: '#000', borderRadius: 10,
                    }}>Finalized</span>
                  )}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  {trip.members.length} member{trip.members.length !== 1 ? 's' : ''}
                  {trip.trip_start && trip.trip_end && (
                    <span> · {fmtDate(trip.trip_start)} – {fmtDate(trip.trip_end)}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                {trip.organizer_id === user?.id && (
                  confirmDelete === trip.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#e55' }}>Delete this trip?</span>
                      <button className="btn-ghost" onClick={(e) => deleteTrip(e, trip.id)} disabled={deleting}
                        style={{ fontSize: 12, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                        {deleting ? '...' : 'Yes'}
                      </button>
                      <button className="btn-ghost" onClick={() => setConfirmDelete(null)}
                        style={{ fontSize: 12, padding: '3px 8px' }}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn-ghost" onClick={() => setConfirmDelete(trip.id)}
                      style={{ fontSize: 12, padding: '3px 8px', color: '#888', borderColor: '#444' }}>
                      Delete
                    </button>
                  )
                )}
                {confirmDelete !== trip.id && <span style={{ color: 'var(--text-muted)' }}>→</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
