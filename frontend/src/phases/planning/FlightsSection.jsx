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

function FlightFields({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
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
    </div>
  )
}

function FlightReadRow({ label, value }) {
  const parts = [value.flight_number, value.airport, fmtDate(value.date), fmtTime(value.time)].filter(Boolean)
  if (!parts.length) return null
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 6 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{parts.join(' · ')}</span>
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
  const hasAny = hasData(arrival) || hasData(departure)
  const [editing, setEditing] = useState(canEdit && !hasAny)

  const displayName = member.name
    || (member.invite_email ? member.invite_email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : `Member ${member.id}`)

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
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : (hasAny ? 8 : 12) }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
        {canEdit && !editing && (
          <button className="btn-ghost" onClick={() => setEditing(true)} style={{ fontSize: 11, padding: '2px 8px' }}>Edit</button>
        )}
        {saved && <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>✓ Saved</span>}
      </div>

      {editing ? (
        <>
          <FlightFields label="✈️ Arrival" value={arrival} onChange={setArrival} />
          <FlightFields label="🛫 Departure" value={departure} onChange={setDeparture} />
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-ghost" onClick={handleSave} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
                {saving ? '...' : 'Save'}
              </button>
              {hasAny && (
                <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 12, padding: '4px 12px', color: '#666' }}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <FlightReadRow label="✈️ Arrival" value={arrival} />
          <FlightReadRow label="🛫 Departure" value={departure} />
          {!hasAny && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No flights added yet.</div>}
        </>
      )}
    </div>
  )
}

function CarRentalSection({ trip, onUpdated }) {
  const [rentals, setRentals] = useState(trip.car_rentals || [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(trip.car_rentals || [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const addDriver = () => setDraft(d => [...d, { name: '', seats: '' }])
  const removeDriver = (i) => setDraft(d => d.filter((_, idx) => idx !== i))
  const updateDriver = (i, field, val) => setDraft(d => d.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const handleSave = async () => {
    setSaving(true)
    try {
      const cleaned = draft.filter(r => r.name?.trim()).map(r => ({ name: r.name.trim(), seats: parseInt(r.seats) || 0 }))
      await client.patch(`/trips/${trip.id}/car_rentals`, { car_rentals: cleaned.length ? cleaned : null })
      setRentals(cleaned)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = () => {
    setDraft(rentals.length ? rentals.map(r => ({ ...r, seats: String(r.seats) })) : [{ name: '', seats: '' }])
    setEditing(true)
  }

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>🚗 Car Rentals</div>
        {!editing && (
          <button className="btn-ghost" onClick={startEdit} style={{ fontSize: 11, padding: '2px 8px' }}>
            {rentals.length ? 'Edit' : '+ Add'}
          </button>
        )}
        {saved && <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>✓ Saved</span>}
      </div>

      {editing ? (
        <>
          {draft.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Driver name"
                value={r.name}
                onChange={e => updateDriver(i, 'name', e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                type="number"
                placeholder="Seats"
                min={1}
                value={r.seats}
                onChange={e => updateDriver(i, 'seats', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => removeDriver(i)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={addDriver} style={{ fontSize: 12, padding: '4px 10px' }}>+ Add Driver</button>
            <button className="btn-ghost" onClick={handleSave} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
              {saving ? '...' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 12, padding: '4px 10px', color: '#666' }}>Cancel</button>
          </div>
        </>
      ) : rentals.length ? (
        <div>
          {rentals.map((r, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: '#fff' }}>{r.name}</span>
              {r.seats > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {r.seats} seat{r.seats !== 1 ? 's' : ''} available</span>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No rental cars added yet. Click + Add to let the crew know who&apos;s driving.</div>
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
      <CarRentalSection trip={trip} onUpdated={onUpdated} />
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
