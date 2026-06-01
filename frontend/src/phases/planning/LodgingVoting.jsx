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
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {od.booking_link && (
              <a href={od.booking_link} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                Book →
              </a>
            )}
            {(od.name || od.address) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([od.address, od.name].filter(Boolean).join(' '))}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#6699cc', textDecoration: 'underline' }}>
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

function ManualLodgingForm({ tripId, onAdded }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [type, setType] = useState('')
  const [address, setAddress] = useState('')
  const [beds, setBeds] = useState('')
  const [capacity, setCapacity] = useState('')
  const [link, setLink] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setAdding(true)
    setError(null)
    try {
      await nominateLodging(tripId, {
        option_data: {
          name: name.trim(),
          price_per_night: price ? parseFloat(price) : undefined,
          type: type.trim() || undefined,
          address: address.trim() || undefined,
          beds: beds ? parseInt(beds, 10) : undefined,
          capacity: capacity ? parseInt(capacity, 10) : undefined,
          booking_link: link.trim() || undefined,
        },
      })
      setName(''); setPrice(''); setType(''); setAddress(''); setBeds(''); setCapacity(''); setLink('')
      onAdded()
    } catch {
      setError('Failed to add lodging. Try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        {[
          { label: 'Name *', val: name, set: setName, ph: 'e.g. Sycamore House', w: 180 },
          { label: 'Type', val: type, set: setType, ph: 'vacation rental, hotel…', w: 150 },
          { label: 'Price/night ($)', val: price, set: setPrice, ph: '850', w: 110, type: 'number' },
          { label: 'Beds', val: beds, set: setBeds, ph: '4', w: 70, type: 'number' },
          { label: 'Sleeps', val: capacity, set: setCapacity, ph: '8', w: 70, type: 'number' },
          { label: 'Address', val: address, set: setAddress, ph: '123 Golf Rd…', w: 200 },
          { label: 'Booking link', val: link, set: setLink, ph: 'https://…', w: 200 },
        ].map(({ label, val, set, ph, w, type: t }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
            <input type={t || 'text'} value={val} onChange={e => set(e.target.value)} placeholder={ph}
              style={{ padding: '6px 10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, width: w }} />
          </div>
        ))}
        <button className="btn-primary" onClick={handleAdd} disabled={adding || !name.trim()} style={{ fontSize: 13 }}>
          {adding ? 'Enriching with AI...' : 'Add'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#e55', marginTop: 4 }}>{error}</div>}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI card */}
        <div className="card">
          <h3 style={{ marginBottom: 4, fontWeight: 600, marginTop: 0 }}>Find Lodging with AI</h3>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            AI will suggest options based on your destination and group size.
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>What type of lodging?</div>
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
              {settingUp ? 'Setting up...' : 'Find Lodging Options with AI'}
            </button>
            <button className="btn-ghost" onClick={() => { setSkipped(true); onLodgingUpdated?.() }} style={{ fontSize: 13 }}>
              Skip / Find My Own
            </button>
          </div>
        </div>

        {/* Manual card */}
        <div className="card">
          <h3 style={{ marginBottom: 4, fontWeight: 600, marginTop: 0 }}>Add Lodging Manually</h3>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Already have a place in mind? Add it directly.
          </div>
          <ManualLodgingForm tripId={trip.id} onAdded={() => { setNotSetUp(false); loadLodging() }} />
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
          <ManualLodgingForm tripId={trip.id} onAdded={loadLodging} />
        </div>
      )}
    </div>
  )
}
