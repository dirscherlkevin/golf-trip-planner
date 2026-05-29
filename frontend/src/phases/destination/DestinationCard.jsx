import { useState } from 'react'
import { voteOnDestination, lockDestination, previewDestinationCourses, removeDestinationNomination } from '../../api/destinations'

const TIER_COLORS = { premium: '#cc9900', midrange: 'var(--accent-green)', value: '#6699cc' }

export default function DestinationCard({ trip, destination, index, tally, isOrganizer, isLocked, onVoted, onLocked, onRemoved, plannedRounds }) {
  const [voting, setVoting] = useState(false)
  const [locking, setLocking] = useState(false)
  const [confirmLock, setConfirmLock] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewCourses, setPreviewCourses] = useState(null)
  const [previewError, setPreviewError] = useState('')

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

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await removeDestinationNomination(trip.id, index)
      onRemoved()
    } catch {
      setRemoving(false)
      setConfirmRemove(false)
    }
  }

  const handlePreview = async () => {
    if (previewOpen && previewCourses) {
      setPreviewOpen(false)
      return
    }
    setPreviewOpen(true)
    if (previewCourses) return  // already loaded
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const data = await previewDestinationCourses(
        trip.id,
        destination.name,
        destination.region || '',
        plannedRounds ?? trip?.planned_rounds ?? 3,
      )
      setPreviewCourses(data.courses)
    } catch {
      setPreviewError('Failed to load course recommendations. Try again.')
    } finally {
      setPreviewLoading(false)
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {destination.est_cost_per_person_rounds != null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>${destination.est_cost_per_person_rounds?.toLocaleString()}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>est. per person (rounds only)</div>
            </div>
          )}
          {isOrganizer && !isLocked && (
            <div style={{ display: 'flex', gap: 6 }}>
              {!confirmRemove ? (
                <button
                  className="btn-ghost"
                  onClick={() => setConfirmRemove(true)}
                  style={{ fontSize: 11, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}
                >
                  Remove
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#e55' }}>Remove this option?</span>
                  <button className="btn-ghost" onClick={handleRemove} disabled={removing}
                    style={{ fontSize: 11, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                    {removing ? '...' : 'Yes'}
                  </button>
                  <button className="btn-ghost" onClick={() => setConfirmRemove(false)}
                    style={{ fontSize: 11, padding: '3px 8px' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Why it fits */}
      {destination.why_it_fits && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>{destination.why_it_fits}</p>
      )}

      {/* Top courses from AI suggestion */}
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

      {/* Course preview button */}
      <div>
        <button
          className="btn-ghost"
          onClick={handlePreview}
          disabled={previewLoading}
          style={{ fontSize: 13 }}
        >
          {previewLoading ? 'Loading courses...' : previewOpen ? 'Hide Course Recommendations' : 'See Course Recommendations Here →'}
        </button>

        {previewOpen && (
          <div style={{ marginTop: 12 }}>
            {previewError && (
              <div style={{ color: '#e55', fontSize: 13, marginBottom: 8 }}>
                {previewError}
                <button className="btn-ghost" onClick={() => { setPreviewCourses(null); handlePreview() }}
                  style={{ marginLeft: 8, fontSize: 12 }}>Retry</button>
              </div>
            )}
            {previewLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                Asking Claude for course recommendations... (20–30s)
              </div>
            )}
            {previewCourses && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  AI-recommended courses at {destination.name}:
                </div>
                {previewCourses.map((c, i) => (
                  <div key={i} style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{c.location}</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
                          {c.rating && <span>Rating {c.rating}</span>}
                          {c.slope && <span>Slope {c.slope}</span>}
                          {c.par && <span>Par {c.par}</span>}
                          {c.walking_policy && <span>{c.walking_policy}</span>}
                          {c.architect && <span>Architect: {c.architect}</span>}
                          {c.tee_time_window && <span>{c.tee_time_window}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {c.green_fee && (
                          <div style={{ fontWeight: 700, color: 'var(--accent-green)', fontSize: 14 }}>
                            ${c.green_fee}
                            {c.cart_fee ? <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}> + ${c.cart_fee} cart</span> : null}
                          </div>
                        )}
                        {c.tier && (
                          <div style={{ fontSize: 11, color: TIER_COLORS[c.tier] ?? 'var(--text-muted)', textTransform: 'capitalize', marginTop: 2 }}>
                            {c.tier}
                          </div>
                        )}
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: 'var(--accent-green)', display: 'block', marginTop: 4 }}>
                            Book ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
