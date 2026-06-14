import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTripStore } from '../store/trip'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import MemberPanel from '../components/MemberPanel'
import CostEstimate from '../components/CostEstimate'
import AvailabilityPhase from '../phases/availability/AvailabilityPhase'
import DestinationPhase from '../phases/destination/DestinationPhase'
import PlanningPhase from '../phases/planning/PlanningPhase'
import LodgingVoting from '../phases/planning/LodgingVoting'
import FlightsSection from '../phases/planning/FlightsSection'
import LockInPhase from '../phases/lockin/LockInPhase'
import HypeMoment from '../phases/lockin/HypeMoment'
import { getRounds } from '../api/rounds'

function LodgingPhase() {
  const { trip, lockPhase } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id
  const [lodgingLocked, setLodgingLocked] = useState(false)
  const [allCoursesLocked, setAllCoursesLocked] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [skipping, setSkipping] = useState(false)

  useEffect(() => {
    if (!trip?.id || !isOrganizer) return
    getRounds(trip.id)
      .then(rounds => setAllCoursesLocked(rounds.length > 0 && rounds.every(r => r.locked_course_id !== null)))
      .catch(() => {})
  }, [trip?.id, lodgingLocked])

  const handleAdvance = async () => {
    setAdvancing(true)
    try { await lockPhase('planning') } catch { setAdvancing(false) }
  }

  const handleSkipAndAdvance = async () => {
    setSkipping(true)
    try {
      await client.patch(`/trips/${trip.id}/lodging-skipped`, { skipped: true })
      await lockPhase('planning')
    } catch { setSkipping(false) }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Lodging</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
        Vote on where to stay. The organizer locks it in when ready.
      </p>
      <div style={{ marginBottom: 16, padding: '8px 14px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Running cost/person</div>
        <CostEstimate tripId={trip.id} trip={trip} isOrganizer={isOrganizer} refreshKey={lodgingLocked ? 'locked' : 'open'} />
      </div>
      <LodgingVoting trip={trip} onLodgingUpdated={() => {}} onLockChange={setLodgingLocked} />

      {isOrganizer && allCoursesLocked && (
        <div style={{ marginTop: 24, padding: '16px 20px', background: lodgingLocked ? '#1a2a1a' : '#141414', borderRadius: 10, border: lodgingLocked ? '1px solid var(--accent-green)' : '1px solid #2a2a2a' }}>
          {lodgingLocked ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent-green)', marginBottom: 4 }}>All set — ready to lock it in!</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All courses and lodging are locked. Advance to finalize the trip.</div>
              </div>
              <button className="btn-primary" onClick={handleAdvance} disabled={advancing} style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
                {advancing ? 'Advancing...' : 'Advance to Lock It In →'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                All courses are locked. Lock a lodging option above or skip to advance.
              </div>
              <button className="btn-ghost" onClick={handleSkipAndAdvance} disabled={skipping} style={{ fontSize: 13 }}>
                {skipping ? 'Advancing...' : 'Skip Lodging and Advance →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TodoBanner({ phases, user, trip, refreshKey }) {
  const openPhase = phases.find(p => p.status === 'open')?.phase
  const [todo, setTodo] = useState(null)

  useEffect(() => {
    if (!openPhase || !trip?.id || !user?.id) { setTodo(null); return }
    if (openPhase === 'availability') {
      client.get(`/trips/${trip.id}/availability`)
        .then(r => {
          const responded = r.data.responded_user_ids ?? []
          if (!responded.includes(user.id)) {
            setTodo('Submit your availability — the organizer is waiting!')
          } else {
            setTodo(null)
          }
        })
        .catch(() => setTodo(null))
    } else if (openPhase === 'destination') {
      client.get(`/trips/${trip.id}/destinations`)
        .then(r => {
          const suggestions = r.data?.suggestion?.suggestions || []
          const tallies = r.data?.vote_tallies || []
          const hasVoted = tallies.some(t => t.my_vote != null)
          setTodo(hasVoted && suggestions.length > 0 ? null : suggestions.length > 0 ? 'Vote on the destination options below.' : null)
        })
        .catch(() => setTodo('Vote on the destination options below.'))
    } else if (openPhase === 'planning') {
      client.get(`/trips/${trip.id}/rounds`)
        .then(r => {
          const rounds = r.data || []
          const unlockedRounds = rounds.filter(r => r.locked_course_id == null && r.nominations?.length > 0)
          const hasVotedAll = unlockedRounds.length === 0 || unlockedRounds.every(r =>
            r.nominations?.some(n => n.vote_tally?.my_vote != null)
          )
          setTodo(hasVotedAll ? null : 'Vote on courses and lodging options below.')
        })
        .catch(() => setTodo('Vote on courses and lodging options below.'))
    } else {
      setTodo(null)
    }
  }, [openPhase, trip?.id, user?.id, refreshKey])

  if (!todo) return null
  return (
    <div style={{
      background: '#1a2a1a', border: '1px solid var(--accent-green)',
      borderRadius: 8, padding: '10px 16px', marginBottom: 16,
      fontSize: 13, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      📋 <strong>Your action needed:</strong> {todo}
    </div>
  )
}

function FlightsPhase() {
  const { trip, loadTrip } = useTripStore()
  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Transportation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
        Track flights, arrivals, and who&apos;s got a rental car.
      </p>
      <FlightsSection trip={trip} onUpdated={() => loadTrip(trip.id)} />
    </div>
  )
}

const PHASE_COMPONENTS = {
  availability: AvailabilityPhase,
  destination: DestinationPhase,
  courses: PlanningPhase,
  lodging: LodgingPhase,
  flights: FlightsPhase,
  locked_in: LockInPhase,
}

const PHASE_LABELS = {
  availability: 'Availability',
  destination: 'Destinations',
  courses: 'Courses',
  lodging: 'Lodging',
  flights: 'Transportation',
  locked_in: 'Lock It In',
}

const REOPENABLE = new Set(['availability', 'destination', 'planning'])

function PhaseGate({ phases, isOrganizer, onReopen, trip, refreshKey }) {
  const openPhase = phases.find(p => p.status === 'open')
  const openIdx = phases.findIndex(p => p.status === 'open')
  const prevLockedPhase = openIdx > 0 ? phases[openIdx - 1] : null

  const [activeTab, setActiveTab] = useState(null)

  useEffect(() => {
    if (openPhase) {
      // 'planning' phase maps to the 'courses' tab by default
      setActiveTab(openPhase.phase === 'planning' ? 'courses' : openPhase.phase)
    }
  }, [openPhase?.phase])

  // Expand 'planning' into two display tabs: 'courses' and 'lodging'
  const displayPhases = phases.flatMap(p => {
    if (p.phase === 'planning') {
      return [
        { ...p, displayPhase: 'courses' },
        { ...p, displayPhase: 'lodging' },
        { ...p, displayPhase: 'flights' },
      ]
    }
    return [{ ...p, displayPhase: p.phase }]
  })

  const viewPhase = activeTab ?? (openPhase?.phase === 'planning' ? 'courses' : openPhase?.phase)
  // Map displayPhase back to backend phase for status checks
  const backendPhase = (dp) => dp === 'courses' || dp === 'lodging' ? 'planning' : dp
  const viewBackendPhase = backendPhase(viewPhase)

  return (
    <div>
      {/* Phase tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
      }}>
        {displayPhases.map(p => {
          const isOpen = p.status === 'open'
          const isLocked = p.status === 'locked'
          const isPending = p.status === 'pending'
          const isActive = viewPhase === p.displayPhase
          // Only show reopen on the 'courses' tab, not the 'lodging' tab (same backend phase)
          const canReopen = isOrganizer && prevLockedPhase?.phase === backendPhase(p.displayPhase) && REOPENABLE.has(backendPhase(p.displayPhase)) && p.displayPhase !== 'lodging' && p.displayPhase !== 'flights'
          const clickable = !isPending

          return (
            <div key={p.displayPhase} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              flex: '0 0 auto', minWidth: 100,
            }}>
              <button
                onClick={() => clickable && setActiveTab(p.displayPhase)}
                title={isPending ? 'Unlocks once the previous phase is completed' : undefined}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: clickable ? 'pointer' : 'default',
                  background: isActive ? (isOpen ? 'var(--accent-green)' : '#2d4a2d') : isLocked ? '#1a2a1a' : '#1a1a1a',
                  color: isActive ? (isOpen ? '#000' : 'var(--accent-green)') : isPending ? 'var(--text-muted)' : 'var(--text-secondary)',
                  border: isActive ? `2px solid var(--accent-green)` : `1px solid ${isLocked ? '#2d4a2d' : '#333'}`,
                }}
              >
                {isLocked ? '✓ ' : isPending ? '🔒 ' : ''}{PHASE_LABELS[p.displayPhase]}
              </button>
              {isPending && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Previous phase first
                </div>
              )}
              {canReopen && (
                <button
                  onClick={() => onReopen(backendPhase(p.displayPhase))}
                  style={{ fontSize: 12, padding: '2px 8px', background: 'transparent', border: '1px solid #555', borderRadius: 4, color: '#aaa', cursor: 'pointer' }}
                >
                  Reopen
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Locked-phase read-only banner — suppressed on Flights tab since it stays editable */}
      {viewPhase && viewPhase !== 'flights' && phases.find(p => p.phase === viewBackendPhase)?.status === 'locked' && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', background: '#1a1a1a',
          border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 12px',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          🔒 This phase is locked — you're viewing it in read-only mode.
        </div>
      )}

      {viewPhase ? (
        (() => {
          if (trip?.status === 'finalized' && viewPhase !== 'flights') return <HypeMoment key={refreshKey} trip={trip} isOrganizer={isOrganizer} />
          const Component = PHASE_COMPONENTS[viewPhase]
          const extraProps = viewPhase === 'courses' ? { onGoToLodging: () => setActiveTab('lodging') } : {}
          return Component ? <Component key={refreshKey} {...extraProps} /> : null
        })()
      ) : trip?.status === 'finalized' ? (
        <HypeMoment key={refreshKey} trip={trip} isOrganizer={isOrganizer} />
      ) : null}
    </div>
  )
}

export default function TripRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { trip, phases, loading, refreshing, refreshKey, error, loadTrip, refreshPhases, reopenPhase } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [editingTrip, setEditingTrip] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [savingTrip, setSavingTrip] = useState(false)

  const startTripEdit = () => {
    setEditName(trip.name)
    setEditStart(trip.trip_start || '')
    setEditEnd(trip.trip_end || '')
    setEditingTrip(true)
  }
  const saveTripEdit = async () => {
    setSavingTrip(true)
    try {
      await client.patch(`/trips/${trip.id}`, { name: editName, trip_start: editStart || null, trip_end: editEnd || null })
      setEditingTrip(false)
      loadTrip(trip.id)
    } finally { setSavingTrip(false) }
  }

  // M1 — responsive MemberPanel
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [showMembers, setShowMembers] = useState(false)
  const memberCount = trip?.members?.filter(m => m.joined === 'joined').length ?? 0

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    loadTrip(id)
  }, [id])

  useEffect(() => {
    if (!trip?.id) return
    const interval = setInterval(() => refreshPhases(), 15000)
    return () => clearInterval(interval)
  }, [trip?.id])

  if (loading && !trip) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
  if (error && !trip) return <div style={{ padding: 40, color: '#f87171' }}>Error loading trip. Please go back and try again.</div>
  if (!trip) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <button className="btn-ghost" onClick={() => navigate('/')} style={{ fontSize: 12 }}>
                ← Back
              </button>
              {/* U7 — icon-only refresh */}
              <button
                className="btn-ghost"
                onClick={() => loadTrip(id)}
                disabled={refreshing}
                title={refreshing ? 'Refreshing...' : 'Refresh'}
                style={{ fontSize: 16, opacity: refreshing ? 0.6 : 1, padding: '3px 10px' }}
              >
                {refreshing ? '↻' : '↺'}
              </button>
              {/* M1 — members chip on mobile */}
              {isMobile && (
                <button
                  className="btn-ghost"
                  onClick={() => setShowMembers(v => !v)}
                  style={{ fontSize: 12, marginLeft: 'auto' }}
                >
                  👥 {memberCount} {showMembers ? '▲' : '▼'}
                </button>
              )}
            </div>
            {editingTrip ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Trip name"
                  style={{ fontSize: 18, fontWeight: 700, padding: '5px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: 'var(--accent-green)', width: '100%', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Start date</label>
                    <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                      style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#ccc', fontSize: 13, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>End date</label>
                    <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#ccc', fontSize: 13, colorScheme: 'dark' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-primary" onClick={saveTripEdit} disabled={savingTrip || !editName.trim()} style={{ fontSize: 12, padding: '4px 14px' }}>
                    {savingTrip ? '...' : 'Save'}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditingTrip(false)} style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ color: 'var(--accent-green)', fontSize: 24, margin: 0 }}>{trip.name}</h1>
                {isOrganizer && (
                  <button className="btn-ghost" onClick={startTripEdit} title="Edit trip name and dates"
                    style={{ fontSize: 12, padding: '2px 7px', color: 'var(--text-muted)', flexShrink: 0 }}>✏️</button>
                )}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <CostEstimate tripId={trip.id} trip={trip} isOrganizer={user?.id === trip?.organizer_id} />
            </div>
          </div>
          {/* M1 — full panel only on desktop */}
          {!isMobile && <MemberPanel trip={trip} />}
        </div>

        {/* M1 — collapsible panel on mobile */}
        {isMobile && showMembers && (
          <div style={{
            marginTop: 12, padding: '12px 16px',
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
          }}>
            <MemberPanel trip={trip} />
          </div>
        )}
      </div>

      {/* Personal to-do banner */}
      <TodoBanner phases={phases} user={user} trip={trip} refreshKey={refreshKey} />

      {/* Phase content */}
      {phases.length > 0 ? (
        <PhaseGate
          phases={phases}
          isOrganizer={isOrganizer}
          trip={trip}
          refreshKey={refreshKey}
          onReopen={async (phase) => {
            try { await reopenPhase(phase) } catch {}
          }}
        />
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>Loading phases...</p>
      )}
    </div>
  )
}
