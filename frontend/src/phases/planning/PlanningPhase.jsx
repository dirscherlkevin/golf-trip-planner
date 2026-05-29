import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import { getRounds } from '../../api/rounds'
import { getLodging } from '../../api/lodging'
import RoundsSetup from './RoundsSetup'
import RoundVoting from './RoundVoting'
import LodgingVoting from './LodgingVoting'

export default function PlanningPhase() {
  const { trip, lockPhase } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [tab, setTab] = useState('courses')
  const [rounds, setRounds] = useState(null)   // null = not loaded yet
  const [loadError, setLoadError] = useState(null)
  const [lodgingLocked, setLodgingLocked] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const loadRounds = () => {
    if (!trip) return
    getRounds(trip.id)
      .then(data => {
        setRounds(data)
        setLoadError(null)
      })
      .catch(() => {
        setLoadError('Failed to load rounds.')
      })
  }

  const checkLodging = () => {
    if (!trip) return
    getLodging(trip.id)
      .then(data => setLodgingLocked(!!data.locked_option_id))
      .catch(err => {
        if (err.response?.status === 404) setLodgingLocked(true)  // no lodging = organizer is skipping
      })
  }

  useEffect(() => {
    loadRounds()
    checkLodging()
  }, [trip?.id])

  // Poll every 10s while any round has generation_status === 'pending'
  useEffect(() => {
    if (!trip || !rounds) return
    const anyPending = rounds.some(r => r.generation_status === 'pending')
    if (anyPending) {
      const timer = setTimeout(loadRounds, 10000)
      return () => clearTimeout(timer)
    }
  }, [trip?.id, rounds])

  const hasRounds = rounds && rounds.length > 0
  const allRoundsLocked = hasRounds && rounds.every(r => r.locked_course_id !== null)
  const readyToAdvance = isOrganizer && allRoundsLocked && lodgingLocked

  const handleAdvance = async () => {
    setAdvancing(true)
    try {
      await lockPhase('planning')
    } catch {
      setAdvancing(false)
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Phase 3: Courses + Lodging</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Pick courses for each round and choose where to stay. Vote on your favorites, then the organizer locks them in.
      </p>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['courses', 'lodging'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-ghost'}
            style={{ textTransform: 'capitalize' }}
          >
            {t === 'courses' ? 'Courses' : 'Lodging'}
          </button>
        ))}
      </div>

      {tab === 'courses' && (
        <CoursesTab
          trip={trip}
          rounds={rounds}
          loadError={loadError}
          hasRounds={hasRounds}
          isOrganizer={isOrganizer}
          onRoundsSetup={setRounds}
          onRoundUpdated={loadRounds}
        />
      )}

      {tab === 'lodging' && (
        <LodgingVoting trip={trip} onLodgingUpdated={checkLodging} />
      )}

      {/* Advance to Lock It In */}
      {isOrganizer && hasRounds && (
        <div style={{ marginTop: 32, padding: '16px 20px', background: readyToAdvance ? '#1a2a1a' : '#141414', borderRadius: 10, border: readyToAdvance ? '1px solid var(--accent-green)' : '1px solid #2a2a2a' }}>
          {readyToAdvance ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent-green)', marginBottom: 4 }}>
                  All set — ready to lock it in!
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  All courses and lodging are locked. Advance to review and finalize the trip.
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={handleAdvance}
                disabled={advancing}
                style={{ whiteSpace: 'nowrap', marginLeft: 16 }}
              >
                {advancing ? 'Advancing...' : 'Advance to Lock It In →'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Lock all courses{!lodgingLocked ? ' and lodging' : ''} to advance to Lock It In.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CoursesTab({ trip, rounds, loadError, hasRounds, isOrganizer, onRoundsSetup, onRoundUpdated }) {
  if (!trip) return null

  if (loadError) {
    return (
      <div>
        <div style={{ color: '#e55', marginBottom: 12 }}>{loadError}</div>
        <button className="btn-ghost" onClick={onRoundUpdated} style={{ fontSize: 12 }}>Retry</button>
      </div>
    )
  }

  // Still loading
  if (rounds === null) {
    return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Loading rounds...</div>
  }

  // No rounds set up yet
  if (!hasRounds) {
    if (isOrganizer) {
      return <RoundsSetup trip={trip} onSetup={onRoundsSetup} />
    }
    return (
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Waiting for the organizer to set up rounds...</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          The organizer is configuring the rounds. This page will update automatically.
        </div>
        <button className="btn-ghost" onClick={onRoundUpdated} style={{ fontSize: 12 }}>
          Refresh now
        </button>
      </div>
    )
  }

  // Rounds exist — show voting for each
  return (
    <div>
      {rounds.map(round => (
        <RoundVoting
          key={round.id}
          round={round}
          tripId={trip.id}
          isOrganizer={isOrganizer}
          onUpdated={onRoundUpdated}
        />
      ))}
    </div>
  )
}
