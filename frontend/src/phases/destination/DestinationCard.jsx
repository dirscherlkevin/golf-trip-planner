import { useState } from 'react'
import { voteOnDestination, lockDestination } from '../../api/destinations'

export default function DestinationCard({ trip, destination, index, tally, isOrganizer, isLocked, onVoted, onLocked }) {
  const [voting, setVoting] = useState(false)
  const [locking, setLocking] = useState(false)
  const [confirmLock, setConfirmLock] = useState(false)

  const vote = async (v) => {
    setVoting(true)
    try {
      await voteOnDestination(trip.id, index, v)
      onVoted()
    } finally {
      setVoting(false)
    }
  }

  const lock = async () => {
    setLocking(true)
    try {
      await lockDestination(trip.id, index)
      onLocked()
    } finally {
      setLocking(false)
    }
  }

  const netVotes = (tally?.up_votes ?? 0) - (tally?.down_votes ?? 0)
  const myVote = tally?.my_vote

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-green)' }}>{destination.name}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{destination.region}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>${destination.est_cost_per_person_rounds?.toLocaleString()}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>est. per person (rounds only)</div>
        </div>
      </div>

      {/* Why it fits */}
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>{destination.why_it_fits}</p>

      {/* Top courses */}
      {destination.top_courses?.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Top Courses Nearby</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {destination.top_courses.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: '#1a1a1a', borderRadius: 6 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>
                    Rating {c.rating} / Slope {c.slope} · {c.rating_source}
                  </span>
                </div>
                <div style={{ color: 'var(--accent-green)', fontWeight: 600 }}>~${c.est_green_fee}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking warning */}
      {destination.booking_warning && (
        <div style={{ background: '#2a2010', border: '1px solid #554400', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#cc9900' }}>
          ⚠️ {destination.booking_warning}
        </div>
      )}

      {/* Vote + lock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #333', paddingTop: 12 }}>
        {!isLocked && (
          <>
            <button
              className={myVote === 'up' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => vote('up')} disabled={voting}
              style={{ padding: '6px 14px' }}
            >
              👍 {tally?.up_votes ?? 0}
            </button>
            <button
              className={myVote === 'down' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => vote('down')} disabled={voting}
              style={{ padding: '6px 14px' }}
            >
              👎 {tally?.down_votes ?? 0}
            </button>
            <span style={{ color: netVotes > 0 ? 'var(--accent-green)' : netVotes < 0 ? '#e55' : 'var(--text-muted)', fontSize: 13, marginLeft: 4 }}>
              {netVotes > 0 ? `+${netVotes}` : netVotes} net
            </span>
          </>
        )}
        {isLocked && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {tally?.up_votes ?? 0} 👍 · {tally?.down_votes ?? 0} 👎 (voting closed)
          </span>
        )}
        {isOrganizer && !confirmLock && (
          <button
            className="btn-ghost"
            onClick={() => setConfirmLock(true)}
            style={{ marginLeft: 'auto', padding: '6px 16px', border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
          >
            Lock This Destination
          </button>
        )}
        {isOrganizer && confirmLock && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Lock {destination.name}? This opens Phase 3.
            </span>
            <button className="btn-primary" onClick={lock} disabled={locking} style={{ padding: '4px 12px', fontSize: 12 }}>
              {locking ? 'Locking...' : 'Yes, Lock'}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmLock(false)} style={{ padding: '4px 10px', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
