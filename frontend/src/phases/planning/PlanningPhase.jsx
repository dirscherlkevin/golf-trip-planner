import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import { getRounds } from '../../api/rounds'
import RoundsSetup from './RoundsSetup'
import RoundVoting from './RoundVoting'
import LodgingVoting from './LodgingVoting'

export default function PlanningPhase() {
  const { trip } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [tab, setTab] = useState('courses')
  const [rounds, setRounds] = useState(null)   // null = not loaded yet
  const [loadError, setLoadError] = useState(null)

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

  useEffect(() => {
    loadRounds()
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
        <LodgingVoting trip={trip} />
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
