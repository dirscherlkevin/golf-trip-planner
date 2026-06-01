import { useState } from 'react'
import { voteOnCourse, lockRound, unlockRound, generateMoreCourses, nominateCourse, removeCourseNomination } from '../../api/rounds'
import client from '../../api/client'

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
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

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

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await removeCourseNomination(tripId, roundId, id)
      onUpdated()
    } catch {
      setRemoving(false)
      setConfirmRemove(false)
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
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {cd.website && (
              <a href={cd.website} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                Book tee times ↗
              </a>
            )}
            {(cd.name || cd.location) && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent([cd.name, cd.location].filter(Boolean).join(' '))}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                📍 Map
              </a>
            )}
          </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {/* Remove */}
              {!confirmRemove && !confirmLock && (
                <button className="btn-ghost" onClick={() => setConfirmRemove(true)}
                  style={{ fontSize: 11, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                  Remove
                </button>
              )}
              {confirmRemove && (
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#e55' }}>Remove this option?</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={handleRemove} disabled={removing}
                      style={{ fontSize: 11, padding: '4px 8px', color: '#e55', borderColor: '#e55' }}>
                      {removing ? '...' : 'Yes, Remove'}
                    </button>
                    <button className="btn-ghost" onClick={() => setConfirmRemove(false)}
                      style={{ fontSize: 11, padding: '4px 8px' }}>Cancel</button>
                  </div>
                </div>
              )}
              {/* Lock */}
              {!confirmRemove && !confirmLock && (
                <button className="btn-ghost" onClick={() => setConfirmLock(true)} style={{ fontSize: 12 }}>
                  Lock This Course
                </button>
              )}
              {confirmLock && (
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#cc9900' }}>Lock this course?</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" onClick={handleLock} disabled={locking}
                      style={{ fontSize: 11, padding: '4px 8px' }}>
                      {locking ? 'Locking...' : 'Yes, Lock'}
                    </button>
                    <button className="btn-ghost" onClick={() => setConfirmLock(false)}
                      style={{ fontSize: 11, padding: '4px 8px' }}>Cancel</button>
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
  const [changingTier, setChangingTier] = useState(false)
  const [showTierChange, setShowTierChange] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [manualGreenFee, setManualGreenFee] = useState('')
  const [manualCartFee, setManualCartFee] = useState('')
  const [manualRating, setManualRating] = useState('')
  const [manualSlope, setManualSlope] = useState('')
  const [manualWebsite, setManualWebsite] = useState('')
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

  const handleTierChange = async (newTier) => {
    setChangingTier(true)
    try {
      await client.patch(`/trips/${tripId}/rounds/${round.id}/tier`, { tier: newTier })
      onUpdated()
      setShowTierChange(false)
    } catch {
      // ignore
    } finally {
      setChangingTier(false)
    }
  }

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
        green_fee: manualGreenFee ? parseFloat(manualGreenFee) : undefined,
        cart_fee: manualCartFee ? parseFloat(manualCartFee) : undefined,
        rating: manualRating || undefined,
        slope: manualSlope || undefined,
        website: manualWebsite.trim() || undefined,
      })
      setManualName(''); setManualLocation(''); setManualGreenFee('')
      setManualCartFee(''); setManualRating(''); setManualSlope(''); setManualWebsite('')
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
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Round {round.round_number}: {tierLabel}
          </span>
          {isLocked && lockedNom && (
            <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--accent-green)' }}>
              ✅ Locked: {lockedNom.course_data?.name ?? 'Unknown'}
            </span>
          )}
          {/* Tier change (organizer, not locked) */}
          {isOrganizer && !isLocked && (
            <div style={{ marginTop: 4 }}>
              {!showTierChange ? (
                <button className="btn-ghost" onClick={() => setShowTierChange(true)}
                  style={{ fontSize: 10, padding: '2px 6px', color: '#888' }}>
                  Change tier
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {['premium', 'midrange', 'value'].map(t => (
                    <button key={t} className={round.tier === t ? 'btn-primary' : 'btn-ghost'}
                      onClick={() => handleTierChange(t)} disabled={changingTier}
                      style={{ fontSize: 10, padding: '2px 8px', textTransform: 'capitalize' }}>
                      {t}
                    </button>
                  ))}
                  <button className="btn-ghost" onClick={() => setShowTierChange(false)}
                    style={{ fontSize: 10, padding: '2px 6px', color: '#888' }}>✕</button>
                </div>
              )}
            </div>
          )}
        </div>
        {isOrganizer && isLocked && (
          <button className="btn-ghost" onClick={handleUnlock} disabled={unlocking} style={{ fontSize: 12 }}>
            {unlocking ? 'Unlocking...' : 'Unlock Course'}
          </button>
        )}
        {isOrganizer && !isLocked && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button className="btn-ghost" onClick={handleGenerateMore}
              disabled={generatingMore || round.generation_status === 'pending'} style={{ fontSize: 12 }}>
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

        {/* Nominations — hide non-locked options once a course is locked */}
        {round.nominations && round.nominations.length > 0 ? (
          round.nominations.filter(n => !isLocked || n.id === lockedNomId).map(nom => (
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
              {[
                { label: 'Course name *', val: manualName, set: setManualName, ph: 'e.g. Pebble Beach', w: 200 },
                { label: 'Location', val: manualLocation, set: setManualLocation, ph: 'e.g. Pebble Beach, CA', w: 180 },
                { label: 'Green fee ($)', val: manualGreenFee, set: setManualGreenFee, ph: '250', w: 100, type: 'number' },
                { label: 'Cart fee ($)', val: manualCartFee, set: setManualCartFee, ph: '25', w: 90, type: 'number' },
                { label: 'Rating', val: manualRating, set: setManualRating, ph: '74.2', w: 80 },
                { label: 'Slope', val: manualSlope, set: setManualSlope, ph: '142', w: 80 },
                { label: 'Website', val: manualWebsite, set: setManualWebsite, ph: 'https://...', w: 180 },
              ].map(({ label, val, set, ph, w, type }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
                  <input type={type || 'text'} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: w }} />
                </div>
              ))}
              <button className="btn-primary" onClick={handleAddManual} disabled={addingManual || !manualName.trim()} style={{ fontSize: 13 }}>
                {addingManual ? 'Enriching with AI...' : 'Add'}
              </button>
            </div>
            {manualError && <div style={{ fontSize: 12, color: '#e55', marginTop: 4 }}>{manualError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
