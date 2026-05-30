import { useState, useEffect } from 'react'
import client from '../../api/client'

const TIER_COLORS = { premium: '#cc9900', midrange: 'var(--accent-green)', value: '#6699cc' }

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>{value}
    </div>
  )
}

function tripDateOptions(tripStart, tripEnd) {
  if (!tripStart || !tripEnd) return []
  const dates = []
  let cur = new Date(tripStart + 'T00:00:00')
  const end = new Date(tripEnd + 'T00:00:00')
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10)
    const label = cur.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    dates.push({ iso, label })
    cur = new Date(cur.getTime() + 86400000)
  }
  return dates
}

function RoundScheduleEditor({ tripId, roundId, initialDate, initialTee, isOrganizer, dateOptions }) {
  const [date, setDate] = useState(initialDate || '')
  // Tee times stored as comma-separated string; split into array for display
  const [teeTimes, setTeeTimes] = useState(() =>
    initialTee ? initialTee.split(',').map(t => t.trim()).filter(Boolean) : ['']
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async (newDate, newTimes) => {
    setSaving(true)
    const teeStr = newTimes.filter(t => t.trim()).join(', ')
    try {
      await client.patch(`/trips/${tripId}/rounds/${roundId}/tee-time`, {
        tee_time: teeStr,
        round_date: newDate || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const handleDateChange = (val) => {
    setDate(val)
    save(val, teeTimes)
  }

  const updateTeeTime = (idx, val) => {
    const next = [...teeTimes]
    next[idx] = val
    setTeeTimes(next)
  }

  const addTeeTime = () => setTeeTimes(t => [...t, ''])

  const removeTeeTime = (idx) => {
    const next = teeTimes.filter((_, i) => i !== idx)
    setTeeTimes(next.length ? next : [''])
    save(date, next.length ? next : [])
  }

  const hasAnyTime = teeTimes.some(t => t.trim())
  if (!isOrganizer && !date && !hasAnyTime) return null

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: '#111', borderRadius: 6, border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Round Date</div>
          {isOrganizer ? (
            <select value={date} onChange={e => handleDateChange(e.target.value)} disabled={saving}
              style={{ padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#fff', fontSize: 13 }}>
              <option value="">— not set —</option>
              {dateOptions.map(d => <option key={d.iso} value={d.iso}>{d.label}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {date ? (dateOptions.find(d => d.iso === date)?.label ?? date) : '—'}
            </span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tee Time{teeTimes.filter(t => t.trim()).length > 1 ? 's' : ''}
          </div>
          {isOrganizer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {teeTimes.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="text" value={t} onChange={e => updateTeeTime(i, e.target.value)}
                    onBlur={() => save(date, teeTimes)}
                    placeholder="e.g. 8:30 AM"
                    style={{ padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#fff', fontSize: 13, width: 110 }} />
                  {teeTimes.length > 1 && (
                    <button onClick={() => removeTeeTime(i)}
                      style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <button className="btn-ghost" onClick={addTeeTime}
                  style={{ fontSize: 11, padding: '2px 8px' }}>+ Add tee time</button>
                {saved && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Saved</span>}
                {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>saving…</span>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {teeTimes.filter(t => t.trim()).map((t, i) => (
                <span key={i} style={{ fontSize: 14, fontWeight: 600 }}>{t}</span>
              ))}
              {!hasAnyTime && <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BookedCheck({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 8, fontSize: 12 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent-green)' }} />
      <span style={{ color: checked ? 'var(--accent-green)' : 'var(--text-muted)' }}>
        {checked ? '✓ Booked' : label}
      </span>
    </label>
  )
}

function CourseCard({ round, tripId, isOrganizer, dateOptions }) {
  const [booked, setBooked] = useState(round.booked ?? false)

  const toggleBooked = async (val) => {
    setBooked(val)
    try {
      await client.patch(`/trips/${tripId}/rounds/${round.round_id}/booked`, { booked: val })
    } catch { setBooked(!val) }
  }

  const feeStr = round.green_fee
    ? `$${round.green_fee}${round.cart_fee ? ` + $${round.cart_fee} cart` : ''}`
    : null
  const ratingStr = (round.rating || round.slope)
    ? [round.rating && `Rating ${round.rating}`, round.slope && `Slope ${round.slope}`, round.par && `Par ${round.par}`].filter(Boolean).join(' · ')
    : null
  const tierColor = TIER_COLORS[round.tier] || 'var(--text-muted)'

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Round {round.round_number} · {round.tier}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>{round.course_name}</div>
          {round.course_location && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>📍 {round.course_location}</div>
          )}
          <DetailRow label="Rating" value={ratingStr} />
          <DetailRow label="Walking" value={round.walking_policy} />
          <DetailRow label="Architect" value={round.architect} />
          <DetailRow label="Pace of play" value={round.pace_of_play} />
          <DetailRow label="Tee time availability" value={round.tee_time_window} />
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {feeStr && <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>{feeStr}</div>}
          {round.website && (
            <a href={round.website} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--accent-green)', display: 'block', marginTop: 6 }}>
              Book tee times ↗
            </a>
          )}
        </div>
      </div>
      <RoundScheduleEditor
        tripId={tripId}
        roundId={round.round_id}
        initialDate={round.round_date}
        initialTee={round.tee_time}
        isOrganizer={isOrganizer}
        dateOptions={dateOptions}
      />
      {isOrganizer && (
        <BookedCheck checked={booked} onChange={toggleBooked} label="Mark as booked" />
      )}
      {!isOrganizer && booked && (
        <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 8 }}>✓ Booked</div>
      )}
    </div>
  )
}

function LodgingCard({ lodging, tripId, isOrganizer, initialBooked }) {
  const [booked, setBooked] = useState(initialBooked ?? false)

  const toggleBooked = async (val) => {
    setBooked(val)
    try {
      await client.patch(`/trips/${tripId}/lodging-booked`)
    } catch { setBooked(!val) }
  }
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>{lodging.name}</div>
      {lodging.type && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize', marginBottom: 6 }}>{lodging.type}</div>
      )}
      {lodging.address && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {lodging.address}</div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        {lodging.price_per_night != null && (
          <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
            ${lodging.price_per_night.toLocaleString()}/night
          </span>
        )}
        {lodging.beds != null && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {lodging.beds} beds{lodging.capacity != null ? ` · sleeps ${lodging.capacity}` : ''}
          </span>
        )}
        {lodging.distance_to_courses && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{lodging.distance_to_courses} from courses</span>
        )}
      </div>
      {lodging.amenities && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{lodging.amenities}</div>}
      {(lodging.booking_link || lodging.website) && (
        <a href={lodging.booking_link || lodging.website} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--accent-green)', display: 'inline-block', marginTop: 8 }}>
          View / Book ↗
        </a>
      )}
      {isOrganizer && (
        <BookedCheck checked={booked} onChange={toggleBooked} label="Mark lodging as booked" />
      )}
      {!isOrganizer && booked && (
        <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 8 }}>✓ Booked</div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function HypeMoment({ trip, isOrganizer }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/share/' + trip.id)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load trip summary.'); setLoading(false) })
  }, [trip.id])

  const dateOptions = tripDateOptions(trip.trip_start, trip.trip_end)

  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>Loading itinerary...</div>
  if (error) return <div style={{ color: '#f87171', padding: 16 }}>{error}</div>

  return (
    <div>
      {/* Trip header — clean, no celebration banner */}
      <div style={{ marginBottom: 28, borderBottom: '1px solid #2a2a2a', paddingBottom: 20 }}>
        <h2 style={{ color: 'var(--accent-green)', margin: '0 0 4px 0', fontSize: 26 }}>{trip.name}</h2>
        {data && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 8px' }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
            {data.destination_region && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>({data.destination_region})</span>
            )}
          </div>
        )}
        <button className="btn-ghost" onClick={() => window.open('/share/' + trip.id, '_blank')}
          style={{ fontSize: 12, marginTop: 10 }}>
          Share Trip ↗
        </button>
      </div>

      {data && (
        <>
          {data.members?.length > 0 && (
            <Section title={`Who's Going (${data.members.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.members.map((m, i) => (
                  <span key={i} style={{
                    background: '#1f3b1f', border: '1px solid #2d5c2d',
                    borderRadius: 20, padding: '4px 14px',
                    fontSize: 13, color: 'var(--text-secondary)',
                  }}>{m}</span>
                ))}
              </div>
            </Section>
          )}

          {data.rounds?.length > 0 && (
            <Section title="The Courses">
              {isOrganizer && dateOptions.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Select dates and enter tee times below — saves automatically.
                </div>
              )}
              {data.rounds.map((r, i) => (
                <CourseCard key={i} round={r} tripId={trip.id} isOrganizer={isOrganizer} dateOptions={dateOptions} />
              ))}
            </Section>
          )}

          {data.lodging && (
            <Section title="Where We're Staying">
              <LodgingCard lodging={data.lodging} tripId={trip.id} isOrganizer={isOrganizer} initialBooked={data.lodging_booked} />
            </Section>
          )}

          {(data.rounds?.some(r => r.website) || data.lodging?.booking_link || data.lodging?.website) && (
            <Section title="Booking Links">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.rounds?.filter(r => r.website).map((r, i) => (
                  <a key={i} href={r.website} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent-green)', fontSize: 14, textDecoration: 'none', display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1f3b1f' }}>
                    <span>Round {r.round_number}: {r.course_name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>Book →</span>
                  </a>
                ))}
                {(data.lodging?.booking_link || data.lodging?.website) && (
                  <a href={data.lodging.booking_link || data.lodging.website} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent-green)', fontSize: 14, textDecoration: 'none', display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span>{data.lodging.name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>Book →</span>
                  </a>
                )}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
