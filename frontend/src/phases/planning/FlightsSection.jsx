import { useState } from 'react'
import { useAuthStore } from '../../store/auth'
import client from '../../api/client'

const EMPTY_FLIGHT = { date: '', time: '', flight_number: '', airport: '' }

function FlightFields({ label, value, onChange, readOnly }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      {readOnly ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {[value.flight_number, value.airport, value.date, value.time].filter(Boolean).join(' · ') || '—'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
          {[
            { key: 'date', placeholder: 'Date (Jul 15)', type: 'text' },
            { key: 'time', placeholder: 'Time (2:30pm)', type: 'text' },
            { key: 'flight_number', placeholder: 'Flight # (DL1234)', type: 'text' },
            { key: 'airport', placeholder: 'Airport (PHX)', type: 'text' },
          ].map(({ key, placeholder, type }) => (
            <input
              key={key}
              type={type}
              value={value[key] || ''}
              placeholder={placeholder}
              onChange={e => onChange({ ...value, [key]: e.target.value })}
              style={{
                padding: '5px 8px', background: '#111', border: '1px solid #333',
                borderRadius: 5, color: '#ccc', fontSize: 12, boxSizing: 'border-box', width: '100%',
              }}
            />
          ))}
        </div>
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
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
        {member.name || member.invite_email || 'Member'}
      </div>
      <FlightFields label="✈️ Arrival" value={arrival} onChange={setArrival} readOnly={!canEdit} />
      <FlightFields label="🛫 Departure" value={departure} onChange={setDeparture} readOnly={!canEdit} />
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
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
    <div style={{ marginTop: 32 }}>
      <h3 style={{ color: 'var(--accent-green)', fontSize: 16, margin: '0 0 4px 0' }}>Crew Flights</h3>
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
