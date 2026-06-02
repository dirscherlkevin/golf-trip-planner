import { useState, useEffect } from 'react'
import client from '../../api/client'
import { suggestRestaurants, getSavedPicks, saveRestaurantPick, voteOnPick, deleteRestaurantPick } from '../../api/restaurants'

const TIER_COLORS = { premium: '#cc9900', midrange: 'var(--accent-green)', value: '#6699cc' }

function to24h(display) {
  if (!display) return ''
  if (/^\d{2}:\d{2}$/.test(display)) return display
  const m = display.match(/(\d+):(\d+)\s*(AM|PM)?/i)
  if (!m) return ''
  let h = parseInt(m[1]), min = m[2]
  const ampm = (m[3] || '').toUpperCase()
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

function to12h(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>{value}
    </div>
  )
}

function tripDateOptions(tripStart, tripEnd) {
  if (!tripStart || !tripEnd) return []
  const dates = []
  let cur = new Date(tripStart + 'T00:00:00')
  const end = new Date(tripEnd + 'T00:00:00')
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10)
    const label = cur.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    dates.push({ iso, label })
    cur = new Date(cur.getTime() + 86400000)
  }
  return dates
}

function RoundScheduleEditor({ tripId, roundId, initialDate, initialTee, isOrganizer, dateOptions }) {
  const [date, setDate] = useState(initialDate || '')
  // Tee times stored as comma-separated string; split into array for display
  const [teeTimes, setTeeTimes] = useState(() =>
    initialTee ? initialTee.split(',').map(t => t.trim()).filter(Boolean) : ['']
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async (newDate, newTimes) => {
    setSaving(true)
    const teeStr = newTimes.filter(t => t.trim()).join(', ')
    try {
      await client.patch(`/trips/${tripId}/rounds/${roundId}/tee-time`, {
        tee_time: teeStr,
        round_date: newDate || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const handleDateChange = (val) => {
    setDate(val)
    save(val, teeTimes)
  }

  const updateTeeTime = (idx, val) => {
    const next = [...teeTimes]
    next[idx] = val
    setTeeTimes(next)
  }

  const addTeeTime = () => setTeeTimes(t => [...t, ''])

  const removeTeeTime = (idx) => {
    const next = teeTimes.filter((_, i) => i !== idx)
    setTeeTimes(next.length ? next : [''])
    save(date, next.length ? next : [])
  }

  const hasAnyTime = teeTimes.some(t => t.trim())
  if (!isOrganizer && !date && !hasAnyTime) return null

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: '#111', borderRadius: 6, border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Round Date</div>
          {isOrganizer ? (
            <select value={date} onChange={e => handleDateChange(e.target.value)} disabled={saving}
              style={{ padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#fff', fontSize: 13 }}>
              <option value="">— not set —</option>
              {dateOptions.map(d => <option key={d.iso} value={d.iso}>{d.label}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {date ? (dateOptions.find(d => d.iso === date)?.label ?? date) : '—'}
            </span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tee Time{teeTimes.filter(t => t.trim()).length > 1 ? 's' : ''}
          </div>
          {isOrganizer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {teeTimes.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="time" value={to24h(t)} onChange={e => updateTeeTime(i, e.target.value)}
                    onBlur={() => save(date, teeTimes)}
                    style={{ padding: '5px 8px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 5, color: '#fff', fontSize: 13, width: 110 }} />
                  {teeTimes.length > 1 && (
                    <button onClick={() => removeTeeTime(i)}
                      style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <button className="btn-ghost" onClick={addTeeTime}
                  style={{ fontSize: 11, padding: '2px 8px' }}>+ Add tee time</button>
                {saved && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Saved</span>}
                {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>saving…</span>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {teeTimes.filter(t => t.trim()).map((t, i) => (
                <span key={i} style={{ fontSize: 14, fontWeight: 600 }}>{to12h(t) || t}</span>
              ))}
              {!hasAnyTime && <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BookedCheck({ checked, onChange, onConfirmationChange, onConfirmationBlur, confirmation, label }) {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent-green)' }} />
        <span style={{ color: checked ? 'var(--accent-green)' : 'var(--text-muted)' }}>
          {checked ? '✓ Booked' : label}
        </span>
      </label>
      {checked && onConfirmationChange && (
        <input type="text" value={confirmation}
          onChange={e => onConfirmationChange(e.target.value)}
          onBlur={onConfirmationBlur}
          placeholder="Confirmation # (optional)"
          style={{ marginTop: 4, marginLeft: 20, padding: '3px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#fff', fontSize: 11, width: 200 }} />
      )}
      {checked && confirmation && !onConfirmationChange && (
        <div style={{ marginLeft: 20, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Conf: {confirmation}</div>
      )}
    </div>
  )
}

const VIBE_CHIPS = [
  { label: '🥩 Steakhouse', value: 'steakhouse' },
  { label: '🍺 Brewery', value: 'brewery' },
  { label: '🍸 Cocktail Bar', value: 'cocktail bar' },
  { label: '📺 Sports Bar', value: 'sports bar' },
  { label: '🍕 Pizza', value: 'pizza' },
  { label: '🔥 BBQ', value: 'bbq' },
  { label: '🍔 Burgers', value: 'burgers' },
  { label: '🐟 Seafood', value: 'seafood' },
]

const DISCOVER_CHIPS = [
  { label: '⭐ Top Rated', value: 'top_rated' },
  { label: '💎 Hidden Gem', value: 'hidden_gem' },
]

const VIBE_BADGE = {
  top_rated:  { label: '⭐ Top Rated', color: '#cc9900', bg: 'rgba(204,153,0,0.1)',    border: 'rgba(204,153,0,0.3)' },
  hidden_gem: { label: '💎 Hidden Gem', color: '#6699cc', bg: 'rgba(102,153,204,0.1)', border: 'rgba(102,153,204,0.3)' },
  both:       { label: '⭐💎 Both',     color: '#5a9a5a', bg: 'rgba(90,154,90,0.1)',   border: 'rgba(90,154,90,0.3)' },
}

function CourseCard({ round, tripId, isOrganizer, dateOptions }) {
  const [booked, setBooked] = useState(round.booked ?? false)
  const [confirmation, setConfirmation] = useState(round.confirmation_number ?? '')

  const [restDrawerOpen, setRestDrawerOpen] = useState(false)
  const [filters, setFilters] = useState({ vibes: [], discover: [], hideChains: false, extraNotes: '' })
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [savedPicks, setSavedPicks] = useState([])

  useEffect(() => {
    if (!tripId || !round.round_id) return
    getSavedPicks(tripId, round.round_id).then(setSavedPicks).catch(() => {})
  }, [tripId, round.round_id])

  const refreshPicks = () =>
    getSavedPicks(tripId, round.round_id).then(setSavedPicks).catch(() => {})

  const handleSuggest = async () => {
    setLoadingSuggest(true)
    setSuggestions([])
    try {
      const results = await suggestRestaurants(tripId, {
        round_id: round.round_id,
        vibe_types: filters.vibes,
        discover_modes: filters.discover,
        hide_chains: filters.hideChains,
        extra_notes: filters.extraNotes,
      })
      setSuggestions(results)
    } catch { /* silent */ }
    finally { setLoadingSuggest(false) }
  }

  const handleSavePick = async (s) => {
    try {
      await saveRestaurantPick(tripId, {
        round_id: round.round_id,
        name: s.name, cuisine: s.cuisine, price_range: s.price_range,
        vibe: s.vibe, reason: s.reason, address: s.address,
        phone: s.phone, maps_url: s.maps_url,
      })
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleVote = async (pickId, vote) => {
    try {
      await voteOnPick(tripId, pickId, vote)
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleRemovePick = async (pickId) => {
    try {
      await deleteRestaurantPick(tripId, pickId)
      setSavedPicks(p => p.filter(x => x.id !== pickId))
    } catch { /* silent */ }
  }

  const toggleChip = (field, value) =>
    setFilters(f => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value],
    }))

  const saveBooked = async (val, conf) => {
    try {
      await client.patch(`/trips/${tripId}/rounds/${round.round_id}/booked`, { booked: val, confirmation_number: conf })
    } catch { /* silent */ }
  }

  const toggleBooked = (val) => {
    setBooked(val)
    saveBooked(val, confirmation)
  }

  const handleConfirmationBlur = () => saveBooked(booked, confirmation)

  const feeStr = round.green_fee
    ? `$${round.green_fee}${round.cart_fee ? ` + $${round.cart_fee} cart` : ''}`
    : null
  const ratingStr = (round.rating || round.slope)
    ? [round.rating && `Rating ${round.rating}`, round.slope && `Slope ${round.slope}`, round.par && `Par ${round.par}`].filter(Boolean).join(' · ')
    : null
  const tierColor = TIER_COLORS[round.tier] || 'var(--text-muted)'

  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Round {round.round_number} · {round.tier}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>
            {round.course_name}
            {round.ranking && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#cc9900',
                background: 'rgba(204,153,0,0.1)', border: '1px solid rgba(204,153,0,0.3)',
                borderRadius: 4, padding: '1px 5px', marginLeft: 6, letterSpacing: 0.5
              }}>
                {round.ranking}
              </span>
            )}
          </div>
          {round.course_location && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>📍 {round.course_location}</div>
          )}
          <DetailRow label="Rating" value={ratingStr} />
          <DetailRow label="Rating source" value={round.rating_source} />
          <DetailRow label="Walking" value={round.walking_policy} />
          <DetailRow label="Architect" value={round.architect} />
          <DetailRow label="Pace of play" value={round.pace_of_play} />
          <DetailRow label="Tee time availability" value={round.tee_time_window} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
            AI-estimated · verify fees and links before booking
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {feeStr && <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>{feeStr}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {round.website && (
              <a href={round.website} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                Book tee times ↗
              </a>
            )}
            {(round.course_name || round.course_location) && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([round.course_name, round.course_location].filter(Boolean).join(' '))}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: '#6699cc', textDecoration: 'underline' }}>
                📍 Map
              </a>
            )}
          </div>
        </div>
      </div>
      <RoundScheduleEditor
        tripId={tripId}
        roundId={round.round_id}
        initialDate={round.round_date}
        initialTee={round.tee_time}
        isOrganizer={isOrganizer}
        dateOptions={dateOptions}
      />
      {isOrganizer && (
        <BookedCheck checked={booked} onChange={toggleBooked} label="Mark as booked"
          confirmation={confirmation} onConfirmationChange={v => { setConfirmation(v) }}
          onConfirmationBlur={handleConfirmationBlur} />
      )}
      {!isOrganizer && booked && (
        <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 8 }}>
          ✓ Booked{confirmation ? ` · Conf: ${confirmation}` : ''}
        </div>
      )}

      {/* ── Restaurant section ── */}
      {savedPicks.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#0a150a', border: '1px solid #1d3a1d', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#5a9a5a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🍽️ Dinner picks — after this round
          </div>
          {savedPicks.map(pick => {
            const badge = VIBE_BADGE[pick.vibe]
            return (
              <div key={pick.id} style={{ background: '#111', border: '1px solid #2a3a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{pick.name}</span>
                      {badge && (
                        <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                          {badge.label}
                        </span>
                      )}
                      {pick.cuisine && (
                        <span style={{ fontSize: 9, color: '#888', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                          {pick.cuisine}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: pick.reason ? 4 : 0 }}>
                      {[pick.price_range, pick.address].filter(Boolean).join(' · ')}
                      {pick.up_votes?.length > 0 && ` · saved by ${pick.up_votes.slice(0, 2).join(', ')}${pick.up_votes.length > 2 ? ` +${pick.up_votes.length - 2}` : ''}`}
                    </div>
                    {pick.reason && (
                      <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{pick.reason}"</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {pick.maps_url && (
                        <a href={pick.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                      )}
                      {pick.phone && <span style={{ fontSize: 11, color: '#666' }}>{pick.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => handleVote(pick.id, 'up')}
                      style={{ background: pick.my_vote === 'up' ? '#1a2a1a' : 'none', border: `1px solid ${pick.my_vote === 'up' ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'up' ? '#5a9a5a' : '#555', cursor: 'pointer' }}>
                      👍 {pick.up_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleVote(pick.id, 'down')}
                      style={{ background: pick.my_vote === 'down' ? '#2a1a1a' : 'none', border: `1px solid ${pick.my_vote === 'down' ? '#6a3a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'down' ? '#9a5a5a' : '#555', cursor: 'pointer' }}>
                      👎 {pick.down_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleRemovePick(pick.id)}
                      style={{ background: 'none', border: 'none', fontSize: 10, color: '#444', cursor: 'pointer', padding: '2px 4px' }}
                      title="Remove pick">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Search drawer ── */}
      <div style={{ marginTop: savedPicks.length > 0 ? 6 : 12 }}>
        <button
          onClick={() => { setRestDrawerOpen(o => !o); setSuggestions([]) }}
          style={{ width: '100%', background: 'none', border: '1px solid #2d4a2d', borderRadius: 6, color: '#5a9a5a', fontSize: 11, padding: '6px', cursor: 'pointer' }}>
          🍽️ {savedPicks.length > 0 ? 'Search for more restaurants' : 'Find food near this course'} {restDrawerOpen ? '▴' : '▾'}
        </button>

        {restDrawerOpen && (
          <div style={{ marginTop: 6, padding: '12px 14px', background: '#111', border: '1px solid #1d3a1d', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Vibe</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {VIBE_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('vibes', chip.value)}
                  style={{ background: filters.vibes.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.vibes.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.vibes.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              {filters.vibes.length === 0 && <span style={{ fontSize: 10, color: '#444', alignSelf: 'center' }}>none = any type</span>}
            </div>

            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Discover</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {DISCOVER_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('discover', chip.value)}
                  style={{ background: filters.discover.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.discover.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.discover.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: filters.hideChains ? '#5a9a5a' : '#666', marginLeft: 'auto' }}>
                <div style={{ width: 28, height: 16, background: filters.hideChains ? '#2d4a2d' : '#222', borderRadius: 8, position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ width: 12, height: 12, background: filters.hideChains ? '#5a9a5a' : '#555', borderRadius: '50%', position: 'absolute', right: filters.hideChains ? 2 : 14, top: 2, transition: 'right 0.2s' }} />
                </div>
                Hide chains
                <input type="checkbox" checked={filters.hideChains} onChange={e => setFilters(f => ({ ...f, hideChains: e.target.checked }))} style={{ display: 'none' }} />
              </label>
            </div>

            <input
              placeholder="Anything else? (patio, live music, cheap...)"
              value={filters.extraNotes}
              onChange={e => setFilters(f => ({ ...f, extraNotes: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 11, marginBottom: 8 }}
            />

            <button onClick={handleSuggest} disabled={loadingSuggest}
              style={{ width: '100%', background: '#2d4a2d', border: 'none', borderRadius: 6, color: '#7ab87a', fontSize: 12, fontWeight: 600, padding: '8px', cursor: 'pointer' }}>
              {loadingSuggest ? '✨ Finding spots...' : '✨ Find restaurants'}
            </button>

            {suggestions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#5a9a5a', marginBottom: 8 }}>✨ {suggestions.length} spots near this course</div>
                {suggestions.map((s, i) => {
                  const badge = VIBE_BADGE[s.vibe]
                  const alreadySaved = savedPicks.some(p => p.name === s.name)
                  return (
                    <div key={s.name} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{s.name}</span>
                            {badge && (
                              <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                                {badge.label}
                              </span>
                            )}
                            {s.cuisine && (
                              <span style={{ fontSize: 9, color: '#888', background: '#111', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                                {s.cuisine}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: s.reason ? 4 : 0 }}>
                            {[s.price_range, s.address].filter(Boolean).join(' · ')}
                          </div>
                          {s.reason && (
                            <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{s.reason}"</div>
                          )}
                          {s.maps_url && (
                            <a href={s.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                          )}
                        </div>
                        <button
                          onClick={() => handleSavePick(s)}
                          disabled={alreadySaved}
                          style={{ background: alreadySaved ? '#2d4a2d' : 'none', border: `1px solid ${alreadySaved ? '#3a6a3a' : '#333'}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, color: alreadySaved ? '#5a9a5a' : '#888', cursor: alreadySaved ? 'default' : 'pointer', flexShrink: 0 }}>
                          {alreadySaved ? '📌 Saved' : '📌 Save'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => { setSuggestions([]); setFilters({ vibes: [], discover: [], hideChains: false, extraNotes: '' }) }}
                  style={{ width: '100%', background: 'none', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', fontSize: 11, padding: '5px', cursor: 'pointer', marginTop: 4 }}>
                  ↻ Try different filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LodgingCard({ lodging, tripId, isOrganizer, initialBooked, initialConfirmation }) {
  const [booked, setBooked] = useState(initialBooked ?? false)
  const [confirmation, setConfirmation] = useState(initialConfirmation ?? '')

  const saveBooked = async (val, conf) => {
    try {
      await client.patch(`/trips/${tripId}/lodging-booked`, { booked: val, confirmation_number: conf })
    } catch { /* silent */ }
  }

  const toggleBooked = (val) => { setBooked(val); saveBooked(val, confirmation) }
  const handleConfirmationBlur = () => saveBooked(booked, confirmation)
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 2 }}>{lodging.name}</div>
      {lodging.type && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize', marginBottom: 6 }}>{lodging.type}</div>
      )}
      {lodging.address && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>📍 {lodging.address}</div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
        {lodging.price_per_night != null && (
          <span style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
            ${lodging.price_per_night.toLocaleString()}/night
          </span>
        )}
        {lodging.beds != null && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {lodging.beds} beds{lodging.capacity != null ? ` · sleeps ${lodging.capacity}` : ''}
          </span>
        )}
        {lodging.distance_to_courses && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{lodging.distance_to_courses} from courses</span>
        )}
      </div>
      {lodging.amenities && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{lodging.amenities}</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {(lodging.booking_link || lodging.website) && (
          <a href={lodging.booking_link || lodging.website} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--accent-green)' }}>
            View / Book ↗
          </a>
        )}
        {(lodging.address || lodging.name) && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lodging.address, lodging.name].filter(Boolean).join(' '))}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#6699cc', textDecoration: 'underline' }}>
            📍 Map
          </a>
        )}
      </div>
      {isOrganizer && (
        <BookedCheck checked={booked} onChange={toggleBooked} label="Mark lodging as booked"
          confirmation={confirmation} onConfirmationChange={v => setConfirmation(v)}
          onConfirmationBlur={handleConfirmationBlur} />
      )}
      {!isOrganizer && booked && (
        <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 8 }}>
          ✓ Booked{confirmation ? ` · Conf: ${confirmation}` : ''}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function HypeMoment({ trip, isOrganizer }) {
  const [unlocking, setUnlocking] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatingTagline, setGeneratingTagline] = useState(false)

  useEffect(() => {
    client.get('/share/' + trip.id)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load trip summary.'); setLoading(false) })
  }, [trip.id])

  const dateOptions = tripDateOptions(trip.trip_start, trip.trip_end)

  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>Loading itinerary...</div>
  if (error) return <div style={{ color: '#f87171', padding: 16 }}>{error}</div>

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #0d1f0d, #1a2a1a)',
        border: '1px solid var(--accent-green)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 24,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>🏌️</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent-green)', marginBottom: 4 }}>
          The trip is on!
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Everything is locked in. Time to pack your clubs.
        </div>
      </div>
      {/* Trip header */}
      <div style={{ marginBottom: 28, borderBottom: '1px solid #2a2a2a', paddingBottom: 20 }}>
        <h2 style={{ color: 'var(--accent-green)', margin: '0 0 4px 0', fontSize: 26 }}>{trip.name}</h2>
        {data && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 8px' }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
            {data.destination_region && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>({data.destination_region})</span>
            )}
          </div>
        )}
        {data?.share_tagline ? (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
            "{data.share_tagline}"
          </div>
        ) : isOrganizer && data && (
          <button
            onClick={async () => {
              setGeneratingTagline(true)
              try {
                const r = await client.post(`/share/${trip.id}/tagline`)
                setData(d => ({ ...d, share_tagline: r.data.tagline }))
              } catch { }
              finally { setGeneratingTagline(false) }
            }}
            disabled={generatingTagline}
            style={{ marginTop: 10, background: 'none', border: '1px solid #2d4a2d', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 12px', cursor: 'pointer' }}
          >
            {generatingTagline ? '✨ Writing...' : '✨ Generate trip summary'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => window.open('/share/' + trip.id, '_blank')}
            style={{ fontSize: 12 }}>
            Share Trip ↗
          </button>
          {isOrganizer && (
            <button className="btn-ghost" disabled={unlocking}
              style={{ fontSize: 12, color: '#fbbf24', borderColor: '#fbbf24' }}
              onClick={async () => {
                if (!window.confirm('Unlock this trip? This will reopen it for last-minute changes.')) return
                setUnlocking(true)
                try {
                  await client.post(`/trips/${trip.id}/unlock`)
                  window.location.reload()
                } catch (e) {
                  alert(e.response?.data?.detail || 'Failed to unlock trip')
                  setUnlocking(false)
                }
              }}>
              {unlocking ? 'Unlocking...' : '🔓 Unlock Trip'}
            </button>
          )}
        </div>
      </div>

      {data && (
        <>
          {data.members?.length > 0 && (
            <Section title={`Who's Going (${data.members.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.members.map((m, i) => (
                  <span key={i} style={{
                    background: '#1f3b1f', border: '1px solid #2d5c2d',
                    borderRadius: 20, padding: '4px 14px',
                    fontSize: 13, color: 'var(--text-secondary)',
                  }}>{m}</span>
                ))}
              </div>
            </Section>
          )}

          {data.rounds?.length > 0 && (
            <Section title="The Courses">
              {isOrganizer && dateOptions.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Select dates and enter tee times below — saves automatically.
                </div>
              )}
              {data.rounds.map((r, i) => (
                <CourseCard key={i} round={r} tripId={trip.id} isOrganizer={isOrganizer} dateOptions={dateOptions} />
              ))}
            </Section>
          )}

          {(data.lodging_all_locked?.length > 0 || data.lodging) && (
            <Section title={`Where We're Staying${(data.lodging_all_locked?.length ?? 1) > 1 ? ` (${data.lodging_all_locked.length} options)` : ''}`}>
              {data.lodging_all_locked?.length > 0
                ? data.lodging_all_locked.map((l, i) => (
                    <LodgingCard
                      key={i}
                      lodging={l}
                      tripId={trip.id}
                      isOrganizer={isOrganizer}
                      initialBooked={i === 0 ? data.lodging_booked : false}
                      initialConfirmation={i === 0 ? data.lodging_confirmation : ''}
                    />
                  ))
                : <LodgingCard lodging={data.lodging} tripId={trip.id} isOrganizer={isOrganizer} initialBooked={data.lodging_booked} initialConfirmation={data.lodging_confirmation} />
              }
            </Section>
          )}

        </>
      )}
    </div>
  )
}
