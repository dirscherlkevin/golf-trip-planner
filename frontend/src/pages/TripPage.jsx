import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import StepNav from '../components/StepNav'
import MemberSidebar from '../components/MemberSidebar'
import AvailabilityCalendar from '../components/AvailabilityCalendar'

export default function TripPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadTrip = () => {
    client.get(`/trips/${id}`).then((r) => { setTrip(r.data); setLoading(false) })
  }

  useEffect(() => { loadTrip() }, [id])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading trip...</div>
  if (!trip) return <div style={{ padding: 40, color: 'var(--accent-amber)' }}>Trip not found.</div>

  const joinedMembers = trip.members.filter((m) => m.joined === 'joined').length

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, color: 'var(--accent-green)' }}>⛳ {trip.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{joinedMembers} member{joinedMembers !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <StepNav current={1} />
        <div style={{ display: 'flex', minHeight: 420 }}>
          <MemberSidebar trip={trip} onInviteSent={loadTrip} />
          <AvailabilityCalendar tripId={trip.id} totalMembers={joinedMembers} />
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            disabled={joinedMembers < 1}
            onClick={() => alert('Location step coming in Plan 2!')}
          >
            Next: Pick Location →
          </button>
        </div>
      </div>
    </div>
  )
}
