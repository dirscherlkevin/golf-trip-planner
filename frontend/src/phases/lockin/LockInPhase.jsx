import { useState, useEffect } from 'react'
import { useTripStore } from '../../store/trip'
import { useAuthStore } from '../../store/auth'
import client from '../../api/client'
import { getDestinations } from '../../api/destinations'
import HypeMoment from './HypeMoment'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
}

export default function LockInPhase() {
  const { trip } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [locking, setLocking] = useState(false)
  const [locked, setLocked] = useState(trip?.status === 'finalized')
  const [error, setError] = useState(null)

  const [rounds, setRounds] = useState([])
  const [lodging, setLodging] = useState(null)
  const [destinationName, setDestinationName] = useState(null)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!trip?.id || locked) return

    let cancelled = false

    const poll = async (isInitial) => {
      if (isInitial) setLoadingData(true)
      try {
        const roundsRes = await client.get(`/trips/${trip.id}/rounds`)
        if (!cancelled) setRounds(roundsRes.data || [])
      } catch {
        if (!cancelled) setRounds([])
      }
      try {
        const lodgingRes = await client.get(`/trips/${trip.id}/lodging`)
        if (!cancelled) setLodging(lodgingRes.data || null)
      } catch {
        if (!cancelled) setLodging(null)
      }
      if (!isOrganizer && !cancelled) {
        try {
          const tripRes = await client.get(`/trips/${trip.id}`)
          if (!cancelled && tripRes.data?.status === 'finalized') setLocked(true)
        } catch {}
      }
      if (isInitial && !cancelled) setLoadingData(false)
    }

    poll(true)
    const interval = setInterval(() => { if (!cancelled) poll(false) }, 10000)

    getDestinations(trip.id)
      .then(d => { if (!cancelled) setDestinationName(d.locked_destination?.name || null) })
      .catch(() => {})

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [trip?.id, isOrganizer, locked])

  // Determine checklist status
  const allRoundsLocked = rounds.length > 0 && rounds.every(r => r.locked_course_id != null)
  const lodgingLocked = lodging != null ? lodging.locked_option_id != null : true // no lodging = not blocking
  const allReady = allRoundsLocked && lodgingLocked

  const handleLock = async () => {
    setLocking(true)
    setError(null)
    try {
      await client.post(`/trips/${trip.id}/lock`, {})
      setLocked(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to lock trip')
    } finally {
      setLocking(false)
    }
  }

  if (!trip) return null

  if (locked) {
    return (
      <div style={{ padding: '0 0 40px 0' }}>
        <HypeMoment trip={trip} />
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 640, padding: 32 }}>
      <h2 style={{ color: 'var(--accent-green)', marginTop: 0, marginBottom: 4 }}>Lock It In</h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 24 }}>
        Review everything below. Once all items are confirmed, lock the trip to finalize plans.
      </p>

      {loadingData ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading checklist...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {/* Dates — always checked in Phase 4 */}
          <ChecklistItem
            label="Dates confirmed"
            detail={trip.trip_start && trip.trip_end
              ? `${formatDate(trip.trip_start)} – ${formatDate(trip.trip_end)}`
              : 'Dates set'}
            done={true}
          />

          {/* Destination — always checked in Phase 4 */}
          <ChecklistItem
            label="Destination selected"
            detail={destinationName || 'Destination confirmed'}
            done={true}
          />

          {/* Rounds */}
          {rounds.length === 0 ? (
            <ChecklistItem label="Rounds" detail="No rounds configured" done={false} />
          ) : (
            rounds.map((r, i) => {
              const lockedNom = r.locked_course_id != null
                ? r.nominations?.find(n => n.id === r.locked_course_id)
                : null
              const courseName = lockedNom?.course_data?.name || 'Course locked'
              return (
                <ChecklistItem
                  key={r.id ?? i}
                  label={`Round ${r.round_number}`}
                  detail={r.locked_course_id != null ? courseName : 'Pending — course not yet selected'}
                  done={r.locked_course_id != null}
                />
              )
            })
          )}

          {/* Lodging */}
          {lodging != null ? (
            <ChecklistItem
              label="Lodging"
              detail={lodging.locked_option_id != null
                ? (lodging.options?.find(o => o.id === lodging.locked_option_id)?.option_data?.name || 'Lodging locked')
                : 'Pending — lodging not yet selected'}
              done={lodging.locked_option_id != null}
            />
          ) : (
            <ChecklistItem
              label="Lodging"
              detail="No lodging configured (optional)"
              done={true}
            />
          )}
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', marginBottom: 16, fontSize: 14 }}>{error}</div>
      )}

      {isOrganizer ? (
        <>
          {!allReady && !loadingData && (
            <div style={{ color: '#fbbf24', fontSize: 14, marginBottom: 16 }}>
              Complete all pending items above before locking.
            </div>
          )}
          <button
            className="btn-primary"
            onClick={handleLock}
            disabled={!allReady || locking || loadingData}
            style={{ width: '100%', padding: '14px 0', fontSize: 16 }}
          >
            {locking ? 'Locking...' : 'Lock It In!'}
          </button>
        </>
      ) : (
        <div style={{
          color: 'var(--text-secondary)',
          fontSize: 14,
          textAlign: 'center',
          padding: '12px 0',
          borderTop: '1px solid #2a2a2a',
        }}>
          Waiting for the organizer to lock the trip.
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            This page refreshes automatically.
          </div>
        </div>
      )}
    </div>
  )
}

function ChecklistItem({ label, detail, done }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 14px',
      background: done ? 'rgba(74,222,128,0.05)' : 'rgba(251,191,36,0.05)',
      border: `1px solid ${done ? '#2d4a2d' : '#4a3a0a'}`,
      borderRadius: 8,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1.4 }}>{done ? '✅' : '⏳'}</span>
      <div>
        <div style={{ fontWeight: 600, color: done ? 'var(--text-secondary)' : '#fbbf24', fontSize: 14 }}>
          {label}
        </div>
        {detail && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{detail}</div>
        )}
      </div>
    </div>
  )
}
