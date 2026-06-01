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
import LockInPhase from '../phases/lockin/LockInPhase'
import HypeMoment from '../phases/lockin/HypeMoment'

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
      setTodo('Vote on the destination options below.')
    } else if (openPhase === 'planning') {
      setTodo('Vote on courses and lodging options below.')
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

const PHASE_COMPONENTS = {
  availability: AvailabilityPhase,
  destination: DestinationPhase,
  planning: PlanningPhase,
  locked_in: LockInPhase,
}

const PHASE_LABELS = {
  availability: 'Availability',
  destination: 'AI Destinations',
  planning: 'Courses + Lodging',
  locked_in: 'Lock It In',
}

const REOPENABLE = new Set(['availability', 'destination', 'planning'])

function PhaseGate({ phases, isOrganizer, onReopen, trip, refreshKey }) {
  const openPhase = phases.find(p => p.status === 'open')
  const openIdx = phases.findIndex(p => p.status === 'open')
  const prevLockedPhase = openIdx > 0 ? phases[openIdx - 1] : null

  const [activeTab, setActiveTab] = useState(null)

  useEffect(() => {
    if (openPhase) setActiveTab(openPhase.phase)
  }, [openPhase?.phase])

  const viewPhase = activeTab ?? openPhase?.phase

  return (
    <div>
      {/* Phase tabs — horizontal scroll on narrow screens (M3) */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
      }}>
        {phases.map(p => {
          const isOpen = p.status === 'open'
          const isLocked = p.status === 'locked'
          const isPending = p.status === 'pending'
          const isActive = viewPhase === p.phase
          const canReopen = isOrganizer && prevLockedPhase?.phase === p.phase && REOPENABLE.has(p.phase)
          const clickable = !isPending

          return (
            <div key={p.phase} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              flex: '0 0 auto', minWidth: 110,
            }}>
              <button
                onClick={() => clickable && setActiveTab(p.phase)}
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
                {isLocked ? '✓ ' : isPending ? '🔒 ' : ''}{PHASE_LABELS[p.phase]}
              </button>
              {/* F5 — pending tab hint */}
              {isPending && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Previous phase first
                </div>
              )}
              {canReopen && (
                <button
                  onClick={() => onReopen(p.phase)}
                  style={{
                    fontSize: 12, padding: '2px 8px',
                    background: 'transparent', border: '1px solid #555',
                    borderRadius: 4, color: '#aaa', cursor: 'pointer',
                  }}
                >
                  Reopen
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Locked-phase read-only banner */}
      {viewPhase && phases.find(p => p.phase === viewPhase)?.status === 'locked' && (
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
          if (trip?.status === 'finalized') return <HypeMoment key={refreshKey} trip={trip} isOrganizer={isOrganizer} />
          const Component = PHASE_COMPONENTS[viewPhase]
          return Component ? <Component key={refreshKey} /> : null
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
            <h1 style={{ color: 'var(--accent-green)', fontSize: 24, margin: 0 }}>{trip.name}</h1>
            <div style={{ marginTop: 6 }}>
              <CostEstimate tripId={trip.id} />
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
