import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import {
  getLodging,
  setupLodging,
  generateMoreLodging,
  nominateLodging,
  voteOnLodging,
  lockLodging,
  unlockLodging,
  removeLodgingOption,
} from '../../api/lodging'

const LODGING_TYPES = [
  { value: 'rental', label: 'Rental House' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'both', label: 'Show Both' },
]

function LodgingOptionCard({ option, tripId, isLocked, isOrganizer, lockedOptId, onUpdated }) {
  const { id, option_data, vote_tally } = option
  const od = option_data || {}
  const tally = vote_tally || {}

  const [confirmLock, setConfirmLock] = useState(false)
  const [locking, setLocking] = useState(false)
  const [voting, setVoting] = useState(false)
  const [lockError, setLockError] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const isThisLocked = lockedOptId === id

  const handleVote = async (vote) => {
    if (voting || isLocked) return
    setVoting(true)
    try {
      await voteOnLodging(tripId, id, vote)
      onUpdated()
    } catch {
      // ignore silently
    } finally {
      setVoting(false)
    }
  }

  const handleLock = async () => {
    setLocking(true)
    setLockError(null)
    try {
      await lockLodging(tripId, id)
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
      await removeLodgingOption(tripId, id)
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

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {od.name || 'Unnamed Option'}
            {isThisLocked && (
              <span style={{ color: 'var(--accent-green)', marginLeft: 8, fontSize: 12 }}>✅ Locked</span>
            )}
          </div>
          {od.type && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'capitalize' }}>
              {od.type}
            </div>
          )}
          {od.price_per_night != null && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>Price/night: </span>${od.price_per_night?.toLocaleString()}
            </div>
          )}
          {od.beds != null && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>Beds: </span>{od.beds}
              {od.capacity != null && <span> · <span style={{ color: 'var(--text-muted)' }}>Capacity: </span>{od.capacity}</span>}
            </div>
          )}
          {od.distance_to_courses && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>Distance: </span>{od.distance_to_courses}
            </div>
          )}
          {od.booking_link && (
            <a
              href={od.booking_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 4, display: 'inline-block' }}
            >
              Book →
            </a>
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

          {isLocked && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              👍 {tally.up_votes ?? 0} · 👎 {tally.down_votes ?? 0}
            </span>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
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
                  Lock This Lodging
                </button>
              )}
              {confirmLock && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#cc9900' }}>Lock this lodging?</div>
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

export default function LodgingVoting({ trip, onLodgingUpdated }) {
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [lodging, setLodging] = useState(null)       // null = not set up yet
  const [notSetUp, setNotSetUp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [selectedType, setSelectedType] = useState('rental')
  const [settingUp, setSettingUp] = useState(false)
  const [setupError, setSetupError] = useState(null)

  const [generatingMore, setGeneratingMore] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [manualType, setManualType] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualBeds, setManualBeds] = useState('')
  const [manualCapacity, setManualCapacity] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [manualError, setManualError] = useState(null)
  const [unlocking, setUnlocking] = useState(false)
  const [skipped, setSkipped] = useState(false)

  const loadLodging = () => {
    if (!trip) return
    getLodging(trip.id)
      .then(data => {
        setLodging(data)
        setNotSetUp(false)
        setLoadError(null)
        onLodgingUpdated?.()
      })
      .catch(err => {
        if (err.response?.status === 404) {
          setNotSetUp(true)
          setLodging(null)
        } else {
          setLoadError('Failed to load lodging options.')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadLodging()
  }, [trip?.id])

  // Poll every 5s while pending
  useEffect(() => {
    if (!trip) return
    if (lodging?.generation_status === 'pending') {
      const timer = setInterval(loadLodging, 5000)
      return () => clearInterval(timer)
    }
  }, [trip?.id, lodging?.generation_status])

  const handleSetup = async () => {
    setSettingUp(true)
    setSetupError(null)
    try {
      const data = await setupLodging(trip.id, selectedType)
      setLodging(data)
      setNotSetUp(false)
    } catch {
      setSetupError('Failed to set up lodging. Try again.')
    } finally {
      setSettingUp(false)
    }
  }

  const handleGenerateMore = async () => {
    if (generatingMore) return
    setGeneratingMore(true)
    try {
      await generateMoreLodging(trip.id)
      loadLodging()
    } catch {
      // ignore
    } finally {
      setGeneratingMore(false)
    }
  }

  const handleUnlock = async () => {
    setUnlocking(true)
    try {
      const data = await unlockLodging(trip.id)
      setLodging(data)
      onLodgingUpdated?.()
    } catch {
      // ignore
    } finally {
      setUnlocking(false)
    }
  }

  const handleAddManual = async () => {
    if (!manualName.trim()) return
    setAddingManual(true)
    setManualError(null)
    try {
      await nominateLodging(trip.id, {
        option_data: {
          name: manualName.trim(),
          price_per_night: manualPrice ? parseFloat(manualPrice) : undefined,
          type: manualType.trim() || undefined,
          address: manualAddress.trim() || undefined,
          beds: manualBeds ? parseInt(manualBeds, 10) : undefined,
          capacity: manualCapacity ? parseInt(manualCapacity, 10) : undefined,
          booking_link: manualLink.trim() || undefined,
        },
      })
      setManualName(''); setManualPrice(''); setManualType('')
      setManualAddress(''); setManualBeds(''); setManualCapacity(''); setManualLink('')
      loadLodging()
    } catch {
      setManualError('Failed to add lodging. Try again.')
    } finally {
      setAddingManual(false)
    }
  }

  const isLocked = !!lodging?.locked_option_id

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Loading lodging...</div>
  }

  if (loadError) {
    return (
      <div style={{ color: '#e55', padding: 16 }}>
        {loadError}
        <button className="btn-ghost" onClick={loadLodging} style={{ marginLeft: 12, fontSize: 13 }}>Retry</button>
      </div>
    )
  }

  // Not set up yet
  if (notSetUp) {
    if (skipped) {
      return (
        <div className="card" style={{ borderColor: '#333' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Lodging: handling separately</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
            You've chosen to find lodging outside this app. All courses being locked is enough to advance.
          </div>
          <button className="btn-ghost" onClick={() => { setSkipped(false); onLodgingUpdated?.() }} style={{ fontSize: 12 }}>
            Actually, set up lodging
          </button>
        </div>
      )
    }

    if (!isOrganizer) {
      return (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Waiting for lodging setup...</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            The organizer is setting up lodging options. This page will update automatically.
          </div>
          <button className="btn-ghost" onClick={loadLodging} style={{ marginTop: 12, fontSize: 12 }}>
            Refresh now
          </button>
        </div>
      )
    }

    return (
      <div className="card">
        <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Set Up Lodging</h3>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>What type of lodging?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {LODGING_TYPES.map(lt => (
              <button
                key={lt.value}
                onClick={() => setSelectedType(lt.value)}
                className={selectedType === lt.value ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 13 }}
              >
                {lt.label}
              </button>
            ))}
          </div>
        </div>
        {setupError && <div style={{ color: '#e55', fontSize: 13, marginBottom: 12 }}>{setupError}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleSetup} disabled={settingUp}>
            {settingUp ? 'Setting up...' : 'Find Lodging Options'}
          </button>
          <button className="btn-ghost" onClick={() => { setSkipped(true); onLodgingUpdated?.() }} style={{ fontSize: 13 }}>
            Skip / Find My Own
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Generation pending */}
      {lodging.generation_status === 'pending' && (
        <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 16 }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🏠</div>
          <div style={{ fontWeight: 600 }}>Generating lodging options...</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            This usually takes 20–30 seconds.
          </div>
        </div>
      )}

      {/* Generation failed */}
      {lodging.generation_status === 'failed' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ color: '#e55', fontWeight: 600, marginBottom: 8 }}>Generation failed.</div>
          {isOrganizer && (
            <button className="btn-ghost" onClick={handleGenerateMore} disabled={generatingMore} style={{ fontSize: 13 }}>
              {generatingMore ? 'Requesting...' : 'Try Again'}
            </button>
          )}
        </div>
      )}

      {/* Locked banner */}
      {isLocked && (
        <div style={{ background: '#1a2a1a', border: '1px solid var(--accent-green)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ <strong>Lodging locked.</strong></span>
          {isOrganizer && (
            <button
              className="btn-ghost"
              onClick={handleUnlock}
              disabled={unlocking}
              style={{ fontSize: 11, padding: '4px 8px' }}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          )}
        </div>
      )}

      {/* Options list */}
      {lodging.options && lodging.options.length > 0 ? (
        lodging.options.map(opt => (
          <LodgingOptionCard
            key={opt.id}
            option={opt}
            tripId={trip.id}
            isLocked={isLocked}
            isOrganizer={isOrganizer}
            lockedOptId={lodging.locked_option_id}
            onUpdated={loadLodging}
          />
        ))
      ) : (
        lodging.generation_status !== 'pending' && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            No lodging options yet.
          </div>
        )
      )}

      {/* Generate more (organizer, not locked) */}
      {isOrganizer && !isLocked && lodging.generation_status !== 'pending' && (
        <button
          className="btn-ghost"
          onClick={handleGenerateMore}
          disabled={generatingMore}
          style={{ fontSize: 13, marginBottom: 20 }}
        >
          {generatingMore ? 'Requesting more...' : 'Generate More Options'}
        </button>
      )}

      {/* Add manually (all members, not locked) */}
      {!isLocked && (
        <div style={{ padding: '12px 14px', background: '#141414', borderRadius: 8, border: '1px solid #2a2a2a', marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add a Lodging Option Manually</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
            {[
              { label: 'Name *', val: manualName, set: setManualName, ph: 'e.g. Sycamore House', w: 180 },
              { label: 'Type', val: manualType, set: setManualType, ph: 'vacation rental, hotel…', w: 150 },
              { label: 'Price/night ($)', val: manualPrice, set: setManualPrice, ph: '850', w: 110, type: 'number' },
              { label: 'Beds', val: manualBeds, set: setManualBeds, ph: '4', w: 70, type: 'number' },
              { label: 'Sleeps', val: manualCapacity, set: setManualCapacity, ph: '8', w: 70, type: 'number' },
              { label: 'Address', val: manualAddress, set: setManualAddress, ph: '123 Golf Rd…', w: 200 },
              { label: 'Booking link', val: manualLink, set: setManualLink, ph: 'https://…', w: 200 },
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
  )
}
