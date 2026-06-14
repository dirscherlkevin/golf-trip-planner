import { useState } from 'react'
import { voteOnCourse, lockRound, unlockRound, generateMoreCourses, nominateCourse, removeCourseNomination, recommendCourse } from '../../api/rounds'
import client from '../../api/client'

async function saveRoundNotes(tripId, roundId, notes) {
  await client.patch(`/trips/${tripId}/rounds/${roundId}/notes`, { notes })
}

async function saveTeeTime(tripId, roundId, teeTime, roundDate, golfersPer) {
  await client.patch(`/trips/${tripId}/rounds/${roundId}/tee-time`, {
    tee_time: teeTime,
    round_date: roundDate || null,
    golfers_per_tee: golfersPer ? parseInt(golfersPer, 10) : null,
  })
}

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

function NominationCard({ nomination, tripId, roundId, isLocked, isOrganizer, lockedNomId, onUpdated, myBudget, lockedCostSoFar }) {
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

  const yardageOptions = cd.yardage_options || {}
  const yardageStr = [
    yardageOptions.championship && `${yardageOptions.championship} (champ)`,
    yardageOptions.member && `${yardageOptions.member} (member)`,
    yardageOptions.forward && `${yardageOptions.forward} (fwd)`,
  ].filter(Boolean).join(' · ') || null

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {cd.name || 'Unnamed Course'}
            {cd.ranking && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#cc9900',
                background: 'rgba(204,153,0,0.1)', border: '1px solid rgba(204,153,0,0.3)',
                borderRadius: 4, padding: '1px 5px', marginLeft: 6, letterSpacing: 0.5
              }}>
                {cd.ranking}
              </span>
            )}
            {isThisLocked && (
              <span style={{ color: 'var(--accent-green)', marginLeft: 8, fontSize: 12 }}>✅ Locked</span>
            )}
          </div>
          {cd.location && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{cd.location}</div>
          )}
          {cd.description && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.4 }}>
              {cd.description}
            </div>
          )}
          <CourseDetail label="Rating" value={ratingStr} />
          <CourseDetail label="Yardage" value={yardageStr} />
          <CourseDetail label="Green fee" value={feeStr} />
          <CourseDetail label="Walking" value={cd.walking_policy} />
          <CourseDetail label="Architect" value={cd.architect} />
          <CourseDetail label="Pace of play" value={cd.pace_of_play} />
          <CourseDetail label="Tee times" value={cd.tee_time_window} />
          <CourseDetail label="Source" value={cd.rating_source} />
          {nomination.source === 'ai' && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
              AI-estimated · verify fees and links before booking
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {cd.website && (
              <a href={cd.website} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                Book tee times ↗
              </a>
            )}
            {(cd.name || cd.location) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([cd.name, cd.location].filter(Boolean).join(' '))}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#6699cc', textDecoration: 'underline' }}>
                📍 Map
              </a>
            )}
          </div>
        </div>

        {/* Over-budget warning for this course */}
        {(() => {
          const fee = (parseFloat(cd.green_fee) || 0) + (parseFloat(cd.cart_fee) || 0)
          const projectedTotal = (lockedCostSoFar || 0) + fee
          if (!myBudget || fee === 0) return null
          if (myBudget.hard != null && projectedTotal > myBudget.hard) {
            return (
              <div style={{ fontSize: 11, color: '#f87171', background: '#2a0a0a', border: '1px solid #7a1a1a', borderRadius: 4, padding: '3px 8px', marginTop: 4, alignSelf: 'flex-start' }}>
                ⚠️ Would put you ${Math.round(projectedTotal - myBudget.hard).toLocaleString()} over your hard limit
              </div>
            )
          }
          if (myBudget.happy != null && projectedTotal > myBudget.happy) {
            return (
              <div style={{ fontSize: 11, color: '#f6ad55', background: '#2a1f00', border: '1px solid #6a4a00', borderRadius: 4, padding: '3px 8px', marginTop: 4, alignSelf: 'flex-start' }}>
                ⚡ Would exceed your happy-spend by ${Math.round(projectedTotal - myBudget.happy).toLocaleString()}
              </div>
            )
          }
          return null
        })()}

        {/* Vote + lock controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 80 }}>
          {!isLocked && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleVote('up')}
                disabled={voting}
                style={{
                  padding: '8px 14px',
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
                  padding: '8px 14px',
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
              {!confirmRemove && !confirmLock && (
                <button className="btn-ghost" onClick={() => setConfirmRemove(true)}
                  style={{ fontSize: 11, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                  Remove
                </button>
              )}
              {!confirmRemove && !confirmLock && (
                <button className="btn-ghost" onClick={() => setConfirmLock(true)} style={{ fontSize: 12 }}>
                  Lock This Course
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmRemove && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#2a0a0a', border: '1px solid #7a1a1a', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#e55' }}>Remove this course option?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={handleRemove} disabled={removing}
              style={{ fontSize: 12, padding: '6px 12px', color: '#e55', borderColor: '#e55' }}>
              {removing ? '...' : 'Yes, Remove'}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmRemove(false)}
              style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
          </div>
        </div>
      )}

      {confirmLock && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#1a1a00', border: '1px solid #6a5a00', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#cc9900' }}>Lock this course for this round?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleLock} disabled={locking}
              style={{ fontSize: 12, padding: '6px 12px' }}>
              {locking ? 'Locking...' : 'Yes, Lock'}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmLock(false)}
              style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
          </div>
          {lockError && <div style={{ width: '100%', fontSize: 11, color: '#e55', marginTop: 4 }}>{lockError}</div>}
        </div>
      )}
    </div>
  )
}

export default function RoundVoting({ round, tripId, isOrganizer, myBudget, lockedCostSoFar, onUpdated, onRemove, removing }) {
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
  // AI recommendation
  const [recommendation, setRecommendation] = useState(null)
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState(null)
  // Tee time editing
  const [editingTeeTime, setEditingTeeTime] = useState(false)
  const [teeTimeStr, setTeeTimeStr] = useState(round.tee_time || '')
  const [roundDateStr, setRoundDateStr] = useState(round.round_date || '')
  const [golfersPer, setGolfersPer] = useState(round.golfers_per_tee?.toString() || '')
  const [savingTeeTime, setSavingTeeTime] = useState(false)
  // Notes
  const [notesText, setNotesText] = useState(round.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  const lockedNomId = round.locked_course_id
  const isLocked = lockedNomId !== null

  const handleSaveTeeTime = async () => {
    setSavingTeeTime(true)
    try {
      await saveTeeTime(tripId, round.id, teeTimeStr, roundDateStr, golfersPer)
      setEditingTeeTime(false)
      onUpdated()
    } finally {
      setSavingTeeTime(false)
    }
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      await saveRoundNotes(tripId, round.id, notesText)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } finally {
      setSavingNotes(false)
    }
  }

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
  const handleRecommend = async () => {
    setLoadingRec(true)
    setRecError(null)
    try {
      const data = await recommendCourse(tripId, round.id)
      setRecommendation(data)
    } catch {
      setRecError('Could not get a recommendation. Try again.')
    } finally {
      setLoadingRec(false)
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
                      style={{ fontSize: 13, padding: '6px 12px', textTransform: 'capitalize' }}>
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
            {onRemove && (
              <button onClick={onRemove} disabled={removing}
                style={{ background: 'none', border: '1px solid #e55', borderRadius: 4, color: '#e55', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
                {removing ? '...' : '− Remove Round'}
              </button>
            )}
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
              myBudget={myBudget}
              lockedCostSoFar={lockedCostSoFar}
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

        {/* Tee time + golfers (organizer, locked round) */}
        {isLocked && isOrganizer && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#0f1a0f', border: '1px solid #2a3a2a', borderRadius: 8 }}>
            {!editingTeeTime ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {round.tee_time ? <>⏰ {round.tee_time}{round.round_date ? ` · ${round.round_date}` : ''}{round.golfers_per_tee ? ` · ${round.golfers_per_tee} golfers` : ''}</> : 'No tee time set yet'}
                </span>
                <button className="btn-ghost" onClick={() => setEditingTeeTime(true)} style={{ fontSize: 11, padding: '2px 8px' }}>
                  {round.tee_time ? 'Edit tee time' : '+ Set tee time'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Tee time <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(local destination time)</span></label>
                  <input type="text" value={teeTimeStr} onChange={e => setTeeTimeStr(e.target.value)} placeholder="e.g. 8:00 AM"
                    style={{ width: 120, padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Date</label>
                  <input type="date" value={roundDateStr} onChange={e => setRoundDateStr(e.target.value)}
                    style={{ width: 140, padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Golfers per tee time</label>
                  <select value={golfersPer} onChange={e => setGolfersPer(e.target.value)}
                    style={{ width: 80, padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13 }}>
                    <option value="">—</option>
                    {[2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button className="btn-primary" onClick={handleSaveTeeTime} disabled={savingTeeTime} style={{ fontSize: 12, padding: '5px 12px' }}>
                  {savingTeeTime ? 'Saving...' : 'Save'}
                </button>
                <button className="btn-ghost" onClick={() => setEditingTeeTime(false)} style={{ fontSize: 12, padding: '5px 8px' }}>Cancel</button>
              </div>
            )}
          </div>
        )}
        {/* Tee time display for non-organizers (locked round) */}
        {isLocked && !isOrganizer && round.tee_time && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            ⏰ {round.tee_time}{round.round_date ? ` · ${round.round_date}` : ''}{round.golfers_per_tee ? ` · ${round.golfers_per_tee} golfers/tee` : ''}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>(local destination time)</span>
          </div>
        )}

        {/* Shared notes */}
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Round notes (shared — anyone can edit)</div>
          <textarea
            value={notesText}
            onChange={e => setNotesText(e.target.value)}
            placeholder="Add notes, reminders, group decisions..."
            rows={2}
            style={{
              width: '100%', padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444',
              borderRadius: 6, color: '#fff', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button className="btn-ghost" onClick={handleSaveNotes} disabled={savingNotes} style={{ fontSize: 12, padding: '3px 10px' }}>
              {savingNotes ? 'Saving...' : 'Save notes'}
            </button>
            {notesSaved && <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>Saved ✓</span>}
          </div>
        </div>

        {/* AI recommendation */}
        {!isLocked && round.nominations?.length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {!recommendation ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn-ghost" onClick={handleRecommend} disabled={loadingRec}
                  style={{ fontSize: 12, padding: '4px 12px' }}>
                  {loadingRec ? '✨ Thinking...' : '✨ Help me decide'}
                </button>
                {recError && <span style={{ fontSize: 12, color: '#e55' }}>{recError}</span>}
              </div>
            ) : (
              <div style={{ padding: '12px 14px', background: '#111f11', border: '1px solid #2a3a2a', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>✨ AI Pick</div>
                  <button onClick={() => setRecommendation(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-green)', marginBottom: 6 }}>
                  {recommendation.recommended}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {recommendation.reason}
                </div>
                <button className="btn-ghost" onClick={handleRecommend} disabled={loadingRec}
                  style={{ fontSize: 11, marginTop: 8, padding: '2px 8px' }}>
                  {loadingRec ? 'Thinking...' : 'Re-ask'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add manually */}
        {!isLocked && (
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#141414', borderRadius: 8, border: '1px solid #2a2a2a' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Add a Course Manually</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Know a great course? Nominate it for the group to consider.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Course name *', val: manualName, set: setManualName, ph: 'e.g. Pebble Beach' },
                { label: 'Location', val: manualLocation, set: setManualLocation, ph: 'e.g. Pebble Beach, CA' },
                { label: 'Green fee ($)', val: manualGreenFee, set: setManualGreenFee, ph: '250', type: 'number' },
                { label: 'Cart fee ($)', val: manualCartFee, set: setManualCartFee, ph: '25', type: 'number' },
                { label: 'Rating', val: manualRating, set: setManualRating, ph: '74.2' },
                { label: 'Slope', val: manualSlope, set: setManualSlope, ph: '142' },
                { label: 'Website', val: manualWebsite, set: setManualWebsite, ph: 'https://...' },
              ].map(({ label, val, set, ph, type }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
                  <input type={type || 'text'} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ width: '100%', padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={handleAddManual} disabled={addingManual || !manualName.trim()} style={{ fontSize: 13 }}>
              {addingManual ? 'Enriching with AI...' : 'Add'}
            </button>
            {manualError && <div style={{ fontSize: 12, color: '#e55', marginTop: 4 }}>{manualError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
