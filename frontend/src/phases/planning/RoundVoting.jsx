import { useState } from 'react'
import { voteOnCourse, lockRound, unlockRound, generateMoreCourses, nominateCourse } from '../../api/rounds'

const TIER_LABELS = {
  premium: 'Premium',
  midrange: 'Midrange',
  value: 'Value',
}

function CourseDetail({ label, value }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>{value}
    </div>
  )
}

function NominationCard({ nomination, tripId, roundId, isLocked, isOrganizer, lockedNomId, onUpdated }) {
  const { id, course_data, vote_tally } = nomination
  const cd = course_data || {}
  const tally = vote_tally || {}

  const [confirmLock, setConfirmLock] = useState(false)
  const [locking, setLocking] = useState(false)
  const [voting, setVoting] = useState(false)
  const [lockError, setLockError] = useState(null)
  const [voteError, setVoteError] = useState(null)

  const isThisLocked = lockedNomId === id

  const handleVote = async (vote) => {
    if (voting || isLocked) return
    setVoting(true)
    setVoteError(null)
    try {
      await voteOnCourse(tripId, roundId, id, vote)
      onUpdated()
    } catch {
      setVoteError('Vote failed. Try again.')
    } finally {
      setVoting(false)
    }
  }

  const handleLock = async () => {
    setLocking(true)
    setLockError(null)
    try {
      await lockRound(tripId, roundId, id)
      onUpdated()
    } catch {
      setLockError('Failed to lock. Try again.')
      setLocking(false)
      setConfirmLock(false)
    }
  }

  const cardStyle = {
    background: '#1a1a1a',
    border: isThisLocked ? '2px solid var(--accent-green)' : '1px solid #333',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 10,
  }

  const feeStr = cd.green_fee
    ? `$${cd.green_fee}${cd.cart_fee ? ` + $${cd.cart_fee} cart` : ''}`
    : null

  const ratingStr = (cd.rating || cd.slope)
    ? [cd.rating && `Rating ${cd.rating}`, cd.slope && `Slope ${cd.slope}`, cd.par && `Par ${cd.par}`].filter(Boolean).join(' · ')
    : null

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {cd.name || 'Unnamed Course'}
            {isThisLocked && (
              <span style={{ color: 'var(--accent-green)', marginLeft: 8, fontSize: 12 }}>✅ Locked</span>
            )}
          </div>
          {cd.location && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{cd.location}</div>
          )}
          <CourseDetail label="Rating" value={ratingStr} />
          <CourseDetail label="Green fee" value={feeStr} />
          <CourseDetail label="Walking" value={cd.walking_policy} />
          <CourseDetail label="Architect" value={cd.architect} />
          <CourseDetail label="Pace of play" value={cd.pace_of_play} />
          <CourseDetail label="Tee times" value={cd.tee_time_window} />
          <CourseDetail label="Source" value={cd.rating_source} />
          {cd.website && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <a href={cd.website} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-green)' }}>
                Book tee times ↗
              </a>
            </div>
          )}
        </div>

        {/* Vote + lock controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 80 }}>
          {!isLocked && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleVote('up')}
                disabled={voting}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #555',
                  background: tally.my_vote === 'up' ? 'var(--accent-green)' : '#2a2a2a',
                  color: tally.my_vote === 'up' ? '#000' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                👍 {tally.up_votes ?? 0}
              </button>
              <button
                onClick={() => handleVote('down')}
                disabled={voting}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #555',
                  background: tally.my_vote === 'down' ? '#5a1a1a' : '#2a2a2a',
                  color: tally.my_vote === 'down' ? '#f88' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                👎 {tally.down_votes ?? 0}
              </button>
            </div>
          )}

          {voteError && (
            <div style={{ fontSize: 11, color: '#e55' }}>{voteError}</div>
          )}

          {isLocked && (
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                👍 {tally.up_votes ?? 0} · 👎 {tally.down_votes ?? 0}
              </span>
            </div>
          )}

          {isOrganizer && !isLocked && (
            <div>
              {!confirmLock ? (
                <button
                  className="btn-ghost"
                  onClick={() => setConfirmLock(true)}
                  style={{ fontSize: 12 }}
                >
                  Lock This Course
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#cc9900' }}>Lock this course?</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-primary"
                      onClick={handleLock}
                      disabled={locking}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      {locking ? 'Locking...' : 'Yes, Lock'}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setConfirmLock(false)}
                      style={{ fontSize: 11, padding: '4px 8px' }}
                    >
                      Cancel
                    </button>
                  </div>
                  {lockError && <div style={{ fontSize: 11, color: '#e55' }}>{lockError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RoundVoting({ round, tripId, isOrganizer, onUpdated }) {
  const [generatingMore, setGeneratingMore] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [manualName, setManualName] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [manualError, setManualError] = useState(null)
  const [unlocking, setUnlocking] = useState(false)

  const lockedNomId = round.locked_course_id
  const isLocked = lockedNomId !== null

  const handleUnlock = async () => {
    setUnlocking(true)
    try {
      await unlockRound(tripId, round.id)
      onUpdated()
    } catch {
      // ignore
    } finally {
      setUnlocking(false)
    }
  }
  const lockedNom = isLocked ? round.nominations?.find(n => n.id === lockedNomId) : null
  const tierLabel = TIER_LABELS[round.tier] ?? round.tier

  const handleGenerateMore = async () => {
    if (generatingMore) return
    setGeneratingMore(true)
    setGenerateError(null)
    try {
      await generateMoreCourses(tripId, round.id)
      onUpdated()
    } catch {
      setGenerateError('Failed to request more suggestions.')
    } finally {
      setGeneratingMore(false)
    }
  }

  const handleAddManual = async () => {
    if (!manualName.trim()) return
    setAddingManual(true)
    setManualError(null)
    try {
      await nominateCourse(tripId, round.id, {
        name: manualName.trim(),
        location: manualLocation.trim(),
      })
      setManualName('')
      setManualLocation('')
      onUpdated()
    } catch {
      setManualError('Failed to add course. Try again.')
    } finally {
      setAddingManual(false)
    }
  }

  const cardStyle = {
    border: isLocked ? '2px solid var(--accent-green)' : '1px solid #333',
    borderRadius: 10,
    marginBottom: 24,
    overflow: 'hidden',
  }

  const headerStyle = {
    background: isLocked ? '#1a2a1a' : '#1e1e1e',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Round {round.round_number}: {tierLabel}
          </span>
          {isLocked && lockedNom && (
            <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--accent-green)' }}>
              ✅ Locked: {lockedNom.course_data?.name ?? 'Unknown'}
            </span>
          )}
        </div>
        {isOrganizer && isLocked && (
          <button
            className="btn-ghost"
            onClick={handleUnlock}
            disabled={unlocking}
            style={{ fontSize: 12 }}
          >
            {unlocking ? 'Unlocking...' : 'Unlock Course'}
          </button>
        )}
        {isOrganizer && !isLocked && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              className="btn-ghost"
              onClick={handleGenerateMore}
              disabled={generatingMore || round.generation_status === 'pending'}
              style={{ fontSize: 12 }}
            >
              {generatingMore ? 'Requesting...' : 'Suggest More'}
            </button>
            {generateError && <div style={{ fontSize: 11, color: '#e55' }}>{generateError}</div>}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        {/* Generation pending */}
        {round.generation_status === 'pending' && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>⛳</div>
            <div style={{ fontWeight: 600 }}>Generating course suggestions...</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              This usually takes 20–30 seconds.
            </div>
          </div>
        )}

        {/* Generation failed */}
        {round.generation_status === 'failed' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#e55', fontWeight: 600, marginBottom: 8 }}>Generation failed.</div>
            {isOrganizer && (
              <button className="btn-ghost" onClick={handleGenerateMore} disabled={generatingMore} style={{ fontSize: 13 }}>
                {generatingMore ? 'Requesting...' : 'Try Again'}
              </button>
            )}
          </div>
        )}

        {/* Nominations */}
        {round.nominations && round.nominations.length > 0 ? (
          round.nominations.map(nom => (
            <NominationCard
              key={nom.id}
              nomination={nom}
              tripId={tripId}
              roundId={round.id}
              isLocked={isLocked}
              isOrganizer={isOrganizer}
              lockedNomId={lockedNomId}
              onUpdated={onUpdated}
            />
          ))
        ) : (
          round.generation_status !== 'pending' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              No suggestions yet.
            </div>
          )
        )}

        {/* Add manually */}
        {!isLocked && (
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#141414', borderRadius: 8, border: '1px solid #2a2a2a' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add a Course Manually</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Course name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Pebble Beach"
                  style={{
                    padding: '6px 10px',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    width: 200,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Location</label>
                <input
                  type="text"
                  value={manualLocation}
                  onChange={e => setManualLocation(e.target.value)}
                  placeholder="e.g. Pebble Beach, CA"
                  style={{
                    padding: '6px 10px',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    width: 200,
                  }}
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleAddManual}
                disabled={addingManual || !manualName.trim()}
                style={{ fontSize: 13 }}
              >
                {addingManual ? 'Adding...' : 'Add'}
              </button>
            </div>
            {manualError && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{manualError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
