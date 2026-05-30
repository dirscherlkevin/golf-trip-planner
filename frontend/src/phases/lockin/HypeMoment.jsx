import { useState, useEffect } from 'react'
import client from '../../api/client'

function useCopyToClipboard(text) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.open(text, '_blank')
    }
  }
  return [copied, copy]
}

const TIER_COLORS = { premium: '#cc9900', midrange: 'var(--accent-green)', value: '#6699cc' }

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>{value}
    </div>
  )
}

function TeeTimeEditor({ tripId, roundId, initialValue, isOrganizer }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await client.patch(`/trips/${tripId}/rounds/${roundId}/tee-time`, { tee_time: value })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  if (!isOrganizer && !value) return null

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: '#111', borderRadius: 6, border: '1px solid #2a2a2a' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Tee Time
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 8:30 AM Saturday"
            autoFocus
            style={{
              flex: 1, padding: '5px 8px', background: '#1a1a1a',
              border: '1px solid #444', borderRadius: 5, color: '#fff', fontSize: 13,
            }}
          />
          <button className="btn-primary" onClick={save} disabled={saving}
            style={{ fontSize: 12, padding: '4px 10px' }}>
            {saving ? '...' : 'Save'}
          </button>
          <button className="btn-ghost" onClick={() => { setEditing(false); setValue(initialValue || '') }}
            style={{ fontSize: 12, padding: '4px 8px' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: value ? '#fff' : 'var(--text-muted)' }}>
            {value || (isOrganizer ? 'Not set yet' : '—')}
          </span>
          {saved && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Saved</span>}
          {isOrganizer && (
            <button className="btn-ghost" onClick={() => setEditing(true)}
              style={{ fontSize: 11, padding: '2px 7px', marginLeft: 'auto' }}>
              {value ? 'Edit' : '+ Set Tee Time'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CourseCard({ round, tripId, isOrganizer }) {
  const feeStr = round.green_fee
    ? `$${round.green_fee}${round.cart_fee ? ` + $${round.cart_fee} cart` : ''}`
    : null
  const ratingStr = (round.rating || round.slope)
    ? [round.rating && `Rating ${round.rating}`, round.slope && `Slope ${round.slope}`, round.par && `Par ${round.par}`].filter(Boolean).join(' · ')
    : null
  const tier = round.tier
  const tierColor = TIER_COLORS[tier] || 'var(--text-muted)'

  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
      padding: '16px 18px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Round {round.round_number} · {tier}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>
            {round.course_name}
          </div>
          {round.course_location && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
              📍 {round.course_location}
            </div>
          )}
          <DetailRow label="Rating" value={ratingStr} />
          <DetailRow label="Walking" value={round.walking_policy} />
          <DetailRow label="Architect" value={round.architect} />
          <DetailRow label="Pace of play" value={round.pace_of_play} />
          <DetailRow label="Tee time availability" value={round.tee_time_window} />
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {feeStr && (
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>{feeStr}</div>
          )}
          {round.website && (
            <a href={round.website} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--accent-green)', display: 'block', marginTop: 6 }}>
              Book tee times ↗
            </a>
          )}
        </div>
      </div>

      <TeeTimeEditor
        tripId={tripId}
        roundId={round.round_id}
        initialValue={round.tee_time}
        isOrganizer={isOrganizer}
      />
    </div>
  )
}

function LodgingCard({ lodging }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px',
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>{lodging.name}</div>
      {lodging.type && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize', marginBottom: 6 }}>
          {lodging.type}
        </div>
      )}
      {lodging.address && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          📍 {lodging.address}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        {lodging.price_per_night != null && (
          <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
            ${lodging.price_per_night.toLocaleString()}/night
          </span>
        )}
        {lodging.beds != null && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {lodging.beds} beds
            {lodging.capacity != null ? ` · sleeps ${lodging.capacity}` : ''}
          </span>
        )}
        {lodging.distance_to_courses && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {lodging.distance_to_courses} from courses
          </span>
        )}
      </div>
      {lodging.amenities && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{lodging.amenities}</div>
      )}
      {(lodging.booking_link || lodging.website) && (
        <a href={lodging.booking_link || lodging.website} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: 'var(--accent-green)', display: 'inline-block', marginTop: 8 }}>
          View / Book ↗
        </a>
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

  const shareUrl = `${window.location.origin}/share/${trip.id}`
  const [copied, copyToClipboard] = useCopyToClipboard(shareUrl)

  useEffect(() => {
    client.get('/share/' + trip.id)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load trip summary.'); setLoading(false) })
  }, [trip.id])

  const fmtDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div>
      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1a2a1a 0%, #0a1a0a 100%)',
        border: '2px solid var(--accent-green)',
        borderRadius: 16, padding: '32px 36px',
        textAlign: 'center', marginBottom: 28,
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 32, margin: '0 0 6px 0' }}>We're Going!</h1>
        <div style={{ fontSize: 20, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{trip.name}</div>
        {data && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 8px' }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
            {data.destination_region && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>({data.destination_region})</span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
          <button className="btn-primary" onClick={() => window.open('/share/' + trip.id, '_blank')}>
            Share the Trip
          </button>
          <button className="btn-ghost" onClick={copyToClipboard} style={{ minWidth: 150 }}>
            {copied ? '✓ Link Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>Loading itinerary...</div>}
      {error && <div style={{ color: '#f87171', padding: 16 }}>{error}</div>}

      {data && (
        <>
          {/* Trip dates + destination (if not already in hero) */}
          {trip.trip_start && trip.trip_end && (
            <Section title="Trip Dates">
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {fmtDate(trip.trip_start)} – {fmtDate(trip.trip_end)}
                </div>
                {trip.trip_start && trip.trip_end && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {Math.round((new Date(trip.trip_end + 'T00:00:00') - new Date(trip.trip_start + 'T00:00:00')) / 86400000)} nights
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Who's going */}
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

          {/* Courses */}
          {data.rounds?.length > 0 && (
            <Section title="The Courses">
              {data.rounds.map((r, i) => (
                <CourseCard key={i} round={r} tripId={trip.id} isOrganizer={isOrganizer} />
              ))}
            </Section>
          )}

          {/* Lodging */}
          {data.lodging && (
            <Section title="Where We're Staying">
              <LodgingCard lodging={data.lodging} />
            </Section>
          )}

          {/* Booking links summary */}
          {(data.rounds?.some(r => r.website) || data.lodging?.booking_link || data.lodging?.website) && (
            <Section title="Booking Links">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.rounds?.filter(r => r.website).map((r, i) => (
                  <a key={i} href={r.website} target="_blank" rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-green)', fontSize: 14, textDecoration: 'none',
                      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                      borderBottom: '1px solid #1f3b1f',
                    }}>
                    <span>Round {r.round_number}: {r.course_name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>Book →</span>
                  </a>
                ))}
                {(data.lodging?.booking_link || data.lodging?.website) && (
                  <a href={data.lodging.booking_link || data.lodging.website} target="_blank" rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-green)', fontSize: 14, textDecoration: 'none',
                      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                    }}>
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
