import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
}

function PendingInvites({ onJoined }) {
  const [invites, setInvites] = useState([])
  const [working, setWorking] = useState({})

  useEffect(() => {
    const load = () => client.get('/trips/invites').then(r => setInvites(r.data)).catch(() => {})
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [])

  if (invites.length === 0) return null

  const respond = async (tripId, action) => {
    setWorking(w => ({ ...w, [tripId]: action }))
    try {
      if (action === 'join') {
        await client.post(`/trips/${tripId}/join`)
        onJoined(tripId)
      } else {
        await client.delete(`/trips/${tripId}/invite`)
      }
      setInvites(inv => inv.filter(i => i.trip_id !== tripId))
    } catch {
      // silent
    } finally {
      setWorking(w => { const n = { ...w }; delete n[tripId]; return n })
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="label" style={{ marginBottom: 10 }}>Trip Invites</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {invites.map(inv => (
          <div key={inv.trip_id} className="card" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: '1px solid #2d4a2d', background: 'rgba(74,222,128,0.04)',
          }}>
            <div>
              <div style={{ fontWeight: 600 }}>{inv.trip_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Invited by {inv.organizer_name}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={() => respond(inv.trip_id, 'join')}
                disabled={!!working[inv.trip_id]}
                style={{ fontSize: 13, padding: '5px 16px' }}
              >
                {working[inv.trip_id] === 'join' ? 'Joining...' : 'Join Trip'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => respond(inv.trip_id, 'decline')}
                disabled={!!working[inv.trip_id]}
                style={{ fontSize: 12, padding: '5px 10px', color: '#888' }}
              >
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [deleteError, setDeleteError] = useState(null)

  const loadTrips = () => client.get('/trips').then((r) => { setTrips(r.data); setLoading(false) })

  useEffect(() => { loadTrips() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setDeleteError(null)
    try {
      await client.delete(`/trips/${tripId}`)
      setTrips(trips.filter(t => t.id !== tripId))
      setConfirmDelete(null)
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Delete failed. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleJoined = () => loadTrips()

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 22 }}>⛳ Golf Trip Planner</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.name}</span>
          <button className="btn-ghost" onClick={loadTrips} style={{ fontSize: 13 }} title="Refresh">↺</button>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>Sign Out</button>
        </div>
      </div>

      <PendingInvites onJoined={handleJoined} />

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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#e55' }}>Delete this trip?</span>
                        <button className="btn-ghost" onClick={(e) => deleteTrip(e, trip.id)} disabled={deleting}
                          style={{ fontSize: 12, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                          {deleting ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button className="btn-ghost" onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                          style={{ fontSize: 12, padding: '3px 8px' }}>Cancel</button>
                      </div>
                      {deleteError && confirmDelete === trip.id && (
                        <div style={{ fontSize: 11, color: '#e55' }}>{deleteError}</div>
                      )}
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
