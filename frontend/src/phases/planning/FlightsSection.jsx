import { useState } from 'react'
import { useAuthStore } from '../../store/auth'
import client from '../../api/client'

const EMPTY_FLIGHT = { date: '', time: '', flight_number: '', airport: '' }

const inputStyle = {
  padding: '6px 8px', background: '#111', border: '1px solid #333',
  borderRadius: 5, color: '#ccc', fontSize: 12, boxSizing: 'border-box',
  width: '100%', colorScheme: 'dark',
}

function fmtDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return iso }
}

function fmtTime(t) {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return t
  const h = parseInt(m[1])
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

function FlightFields({ label, value, onChange, readOnly }) {
  const display = [value.flight_number, value.airport, fmtDate(value.date), fmtTime(value.time)].filter(Boolean).join(' · ')
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      {readOnly ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{display || '—'}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Date</label>
              <input type="date" value={value.date || ''} onChange={e => onChange({ ...value, date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Time</label>
              <input type="time" value={value.time || ''} onChange={e => onChange({ ...value, time: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Flight #</label>
              <input type="text" value={value.flight_number || ''} placeholder="DL1234" onChange={e => onChange({ ...value, flight_number: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Airport</label>
              <input type="text" value={value.airport || ''} placeholder="PHX" onChange={e => onChange({ ...value, airport: e.target.value })} style={inputStyle} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MemberFlightCard({ member, tripId, canEdit, onSaved }) {
  const existing = member.flights || {}
  const [arrival, setArrival] = useState(existing.arrival || { ...EMPTY_FLIGHT })
  const [departure, setDeparture] = useState(existing.departure || { ...EMPTY_FLIGHT })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const hasData = (f) => Object.values(f).some(v => v && v.trim())

  const handleSave = async () => {
    setSaving(true)
    try {
      const flights = {}
      if (hasData(arrival)) flights.arrival = arrival
      if (hasData(departure)) flights.departure = departure
      await client.patch(`/trips/${tripId}/members/${member.id}/flights`, {
        flights: Object.keys(flights).length ? flights : null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const displayName = member.invite_email
    ? member.invite_email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : `Member ${member.id}`

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{displayName}</div>
      <FlightFields label="✈️ Arrival" value={arrival} onChange={setArrival} readOnly={!canEdit} />
      <FlightFields label="🛫 Departure" value={departure} onChange={setDeparture} readOnly={!canEdit} />
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button className="btn-ghost" onClick={handleSave} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
            {saving ? '...' : 'Save'}
          </button>
          {saved && <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>✓ Saved</span>}
        </div>
      )}
    </div>
  )
}

export default function FlightsSection({ trip, onUpdated }) {
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id
  const joinedMembers = (trip?.members || []).filter(m => m.joined === 'joined')

  if (!joinedMembers.length) return null

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 14px 0' }}>
        Track arrivals and departures so everyone knows when the crew lands.
      </p>
      {joinedMembers.map(m => {
        const canEdit = isOrganizer || m.user_id === user?.id
        return (
          <MemberFlightCard
            key={m.id}
            member={m}
            tripId={trip.id}
            canEdit={canEdit}
            onSaved={onUpdated || (() => {})}
          />
        )
      })}
    </div>
  )
}
