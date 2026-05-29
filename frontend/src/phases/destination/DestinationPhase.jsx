import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import { getDestinations, nominateDestination, unlockDestination } from '../../api/destinations'
import { getAvailability } from '../../api/availability'
import GenerateForm from './GenerateForm'
import DestinationCard from './DestinationCard'

export default function DestinationPhase() {
  const { trip, lockPhase, refreshPhases } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [data, setData] = useState(null)  // {suggestion, vote_tallies}
  const [loadError, setLoadError] = useState(null)
  const [budgetData, setBudgetData] = useState(null)
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualRegion, setManualRegion] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [manualError, setManualError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const load = () => {
    if (!trip) return
    getDestinations(trip.id)
      .then(setData)
      .catch(err => {
        if (err.response?.status !== 404) setLoadError('Failed to load suggestions')
        // 404 = no suggestions yet, data stays null
      })
  }

  useEffect(() => {
    load()
  }, [trip?.id])

  // FIX 6: Fetch Phase 1 budget aggregate for organizer
  useEffect(() => {
    if (!trip || !isOrganizer) return
    getAvailability(trip.id).then(d => setBudgetData(d.budget)).catch(() => {})
  }, [trip?.id, isOrganizer])

  // FIX 9: Auto-poll for members while generation is pending or not started
  useEffect(() => {
    if (!trip) return
    const status = data?.suggestion?.generation_status
    // Poll if: no data yet, or status is pending
    if (data === null || status === 'pending') {
      const timer = setTimeout(load, 15000)  // poll every 15 seconds
      return () => clearTimeout(timer)
    }
  }, [trip?.id, data])

  const handleGenerated = (result) => {
    // After generate call, reload from GET to get full suggestion + tallies
    load()
  }

  const handleVoted = () => load()

  const handleLocked = async () => {
    await refreshPhases()
    load()
  }

  const handleAddManual = async () => {
    if (!manualName.trim()) return
    setAddingManual(true)
    setManualError('')
    try {
      await nominateDestination(trip.id, { name: manualName.trim(), region: manualRegion.trim() })
      setManualName('')
      setManualRegion('')
      setShowManualForm(false)
      load()
    } catch {
      setManualError('Failed to add destination. Try again.')
    } finally {
      setAddingManual(false)
    }
  }

  const handleUnlock = async () => {
    setUnlocking(true)
    try {
      await unlockDestination(trip.id)
      await refreshPhases()
      load()
    } catch {
      // ignore
    } finally {
      setUnlocking(false)
    }
  }

  const suggestion = data?.suggestion
  const tallies = data?.vote_tallies ?? []

  const status = suggestion?.generation_status

  // FIX 6: Budget hint — prefer Phase 1 aggregate, fall back to dates
  const fmtDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()}`
  }
  const budgetHint = budgetData
    ? `Group median: $${budgetData.median_happy?.toLocaleString() ?? '?'}/person happy · $${budgetData.median_hard?.toLocaleString() ?? '?'} max`
    : trip?.trip_start
      ? `Trip dates: ${fmtDate(trip.trip_start)} – ${fmtDate(trip.trip_end)}`
      : null

  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Phase 2: AI Destinations</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        The AI will suggest 3 geographically diverse destinations based on your dates, group size, and budget.
      </p>

      {loadError && <div style={{ color: '#e55', marginBottom: 16 }}>{loadError}</div>}

      {/* No suggestions yet */}
      {!suggestion && (
        <>
          {isOrganizer ? (
            <>
              <GenerateForm trip={trip} budgetHint={budgetHint} onGenerated={handleGenerated} />
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#141414', borderRadius: 8, border: '1px solid #2a2a2a' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Or add a destination manually</div>
                {!showManualForm ? (
                  <button className="btn-ghost" onClick={() => setShowManualForm(true)} style={{ fontSize: 13 }}>
                    + Add Manually
                  </button>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Destination name</label>
                        <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Pinehurst, NC"
                          style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: 200 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Region</label>
                        <input type="text" value={manualRegion} onChange={e => setManualRegion(e.target.value)} placeholder="e.g. North Carolina, USA"
                          style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: 200 }} />
                      </div>
                      <button className="btn-primary" onClick={handleAddManual} disabled={addingManual || !manualName.trim()} style={{ fontSize: 13 }}>
                        {addingManual ? 'Adding...' : 'Add'}
                      </button>
                      <button className="btn-ghost" onClick={() => { setShowManualForm(false); setManualError('') }} style={{ fontSize: 13 }}>Cancel</button>
                    </div>
                    {manualError && <div style={{ fontSize: 12, color: '#e55' }}>{manualError}</div>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Waiting for destination suggestions...</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                The organizer is generating AI suggestions. This page will update automatically.
              </div>
              <button className="btn-ghost" onClick={load} style={{ marginTop: 12, fontSize: 12 }}>
                Refresh now
              </button>
            </div>
          )}
        </>
      )}

      {/* Generation in progress */}
      {status === 'pending' && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⛳</div>
          <div style={{ fontWeight: 600 }}>Generating destination suggestions...</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
            This usually takes 20–30 seconds.
          </div>
        </div>
      )}

      {/* Generation failed */}
      {status === 'failed' && (
        <div className="card">
          <div style={{ color: '#e55', fontWeight: 600, marginBottom: 12 }}>
            Suggestion generation failed.
          </div>
          {isOrganizer && (
            <GenerateForm trip={trip} budgetHint={budgetHint} onGenerated={handleGenerated} />
          )}
        </div>
      )}

      {/* Destination cards */}
      {status === 'complete' && suggestion?.suggestions && (
        <>
          {suggestion.locked_destination && (
            <div style={{ background: '#1a2a1a', border: '1px solid var(--accent-green)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>✅ <strong>Destination locked:</strong> {suggestion.locked_destination.name} — {suggestion.locked_destination.region}. Phase 3 is now open!</span>
              {isOrganizer && (
                <button
                  className="btn-ghost"
                  onClick={handleUnlock}
                  disabled={unlocking}
                  style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                >
                  {unlocking ? 'Unlocking...' : 'Unlock'}
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {suggestion.suggestions.map((dest, i) => (
              <DestinationCard
                key={i}
                trip={trip}
                destination={dest}
                index={i}
                tally={tallies.find(t => t.destination_index === i)}
                isOrganizer={isOrganizer && !suggestion.locked_destination}
                isLocked={!!suggestion.locked_destination}
                onVoted={handleVoted}
                onLocked={handleLocked}
              />
            ))}
          </div>

          {/* Manual destination nomination (organizer, not locked) */}
          {isOrganizer && !suggestion.locked_destination && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#141414', borderRadius: 8, border: '1px solid #2a2a2a', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add a Destination Manually</div>
              {!showManualForm ? (
                <button className="btn-ghost" onClick={() => setShowManualForm(true)} style={{ fontSize: 13 }}>
                  + Add Manually
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Destination name</label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={e => setManualName(e.target.value)}
                        placeholder="e.g. Pinehurst, NC"
                        style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: 200 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Region</label>
                      <input
                        type="text"
                        value={manualRegion}
                        onChange={e => setManualRegion(e.target.value)}
                        placeholder="e.g. North Carolina, USA"
                        style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: 200 }}
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
                    <button className="btn-ghost" onClick={() => { setShowManualForm(false); setManualError('') }} style={{ fontSize: 13 }}>
                      Cancel
                    </button>
                  </div>
                  {manualError && <div style={{ fontSize: 12, color: '#e55' }}>{manualError}</div>}
                </div>
              )}
            </div>
          )}

          {/* Regenerate button for organizer when not locked */}
          {isOrganizer && !suggestion.locked_destination && (
            <div style={{ marginTop: 20, padding: '12px 16px', background: '#1a1a1a', borderRadius: 8, border: '1px solid #333' }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Not what you were looking for?</div>
              {!showRegenerate ? (
                <button className="btn-ghost" onClick={() => setShowRegenerate(true)} style={{ fontSize: 13 }}>
                  Try Different Options
                </button>
              ) : (
                <div>
                  <div style={{ color: '#cc9900', fontSize: 12, marginBottom: 12 }}>
                    ⚠️ Regenerating will replace current suggestions and reset all votes.
                  </div>
                  <GenerateForm trip={trip} budgetHint={budgetHint} onGenerated={(result) => { setShowRegenerate(false); handleGenerated(result) }} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
