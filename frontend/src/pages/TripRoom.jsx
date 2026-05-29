import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTripStore } from '../store/trip'
import { useAuthStore } from '../store/auth'
import MemberPanel from '../components/MemberPanel'
import CostEstimate from '../components/CostEstimate'
import AvailabilityPhase from '../phases/availability/AvailabilityPhase'
import DestinationPhase from '../phases/destination/DestinationPhase'
import PlanningPhase from '../phases/planning/PlanningPhase'
import LockInPhase from '../phases/lockin/LockInPhase'

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

function PhaseGate({ phases }) {
  const openPhase = phases.find(p => p.status === 'open')

  return (
    <div>
      {/* Phase progress bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {phases.map(p => {
          const isOpen = p.status === 'open'
          const isLocked = p.status === 'locked'
          const isPending = p.status === 'pending'
          return (
            <div key={p.phase} style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, textAlign: 'center', fontSize: 12, fontWeight: 600,
              background: isOpen ? 'var(--accent-green)' : isLocked ? '#2d4a2d' : '#1a1a1a',
              color: isOpen ? '#000' : isPending ? 'var(--text-muted)' : 'var(--text-secondary)',
              border: isOpen ? 'none' : '1px solid #333',
            }}>
              {isLocked ? '✓ ' : isPending ? '🔒 ' : ''}{PHASE_LABELS[p.phase]}
            </div>
          )
        })}
      </div>

      {/* Active phase content */}
      {openPhase && (() => {
        const Component = PHASE_COMPONENTS[openPhase.phase]
        return Component ? <Component /> : null
      })()}
    </div>
  )
}

export default function TripRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { trip, phases, loading, error, loadTrip } = useTripStore()
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    loadTrip(id)
  }, [id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
  if (error) return <div style={{ padding: 40, color: 'red' }}>Error: {error}</div>
  if (!trip) return null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <button className="btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 8, fontSize: 12 }}>
            ← Back
          </button>
          <h1 style={{ color: 'var(--accent-green)', fontSize: 24, margin: 0 }}>{trip.name}</h1>
          <div style={{ marginTop: 6 }}>
            <CostEstimate tripId={trip.id} />
          </div>
        </div>
        <MemberPanel trip={trip} />
      </div>

      {/* Phase content */}
      {phases.length > 0 ? (
        <PhaseGate phases={phases} />
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>Loading phases...</p>
      )}
    </div>
  )
}
