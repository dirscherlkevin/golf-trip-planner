import { useEffect, useState } from 'react'
import { getOverlap } from '../../api/availability'

function pctColor(pref, total) {
  if (!total || pref === 0) return '#1a1a1a'
  const r = pref / total
  if (r <= 0.25) return '#5a1a1a'    // red — very few
  if (r <= 0.50) return '#5a3a00'    // amber
  if (r <= 0.74) return '#1a4a1a'    // light green
  if (r < 1)     return '#1a6a1a'    // medium green
  return '#22c55e'                    // bright green — everyone
}

function suggestWindows(days, total, windowSize) {
  if (days.length < windowSize) return []
  const dateMap = {}
  for (const d of days) dateMap[d.date] = d

  const windows = []
  for (let i = 0; i <= days.length - windowSize; i++) {
    const slice = days.slice(i, i + windowSize)
    // Check consecutive
    let consecutive = true
    for (let j = 1; j < slice.length; j++) {
      const a = new Date(slice[j-1].date + 'T00:00:00')
      const b = new Date(slice[j].date + 'T00:00:00')
      if (Math.round((b - a) / 86400000) !== 1) { consecutive = false; break }
    }
    if (!consecutive) continue
    const minPref = Math.min(...slice.map(d => d.pref_count ?? d.count))
    const minAll  = Math.min(...slice.map(d => d.count))
    windows.push({ start: slice[0].date, end: slice[slice.length-1].date, minPref, minAll, total })
  }
  windows.sort((a, b) => b.minPref - a.minPref || b.minAll - a.minAll)
  // Remove overlapping windows (keep best)
  const kept = []
  for (const w of windows) {
    const overlaps = kept.some(k => w.start <= k.end && w.end >= k.start)
    if (!overlaps) kept.push(w)
    if (kept.length >= 3) break
  }
  return kept
}

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function OverlapHeatmap({ trip, budget, onDateClick, responses, members }) {
  const [overlap, setOverlap] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    if (!trip) return
    getOverlap(trip.id).then(setOverlap).catch(() => {})
  }, [trip?.id])

  if (!overlap) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading heatmap...</div>

  const total = overlap.total_members

  // Group by month
  const byMonth = {}
  for (const d of overlap.days) {
    const month = d.date.slice(0, 7)
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(d)
  }

  const formatMonth = (m) => {
    const [y, mo] = m.split('-')
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  // Auto-suggest top 3 windows
  const windowSize = (trip?.planned_rounds ?? 3) + 1
  const suggestions = suggestWindows(overlap.days, total, windowSize)

  // Who said what on a clicked date (requires full responses)
  const getDateBreakdown = (date) => {
    if (!responses || !members) return null
    const memberMap = {}
    for (const m of members) {
      if (m.user_id) memberMap[m.user_id] = m.invite_email
    }
    const available = [], ifNeeded = [], unavailable = []
    for (const r of responses) {
      let status = 'unavailable'
      for (const dr of r.date_ranges) {
        if (date >= dr.start && date <= dr.end) {
          status = dr.type === 'if_needed' ? 'if_needed' : 'available'
          break
        }
      }
      const name = memberMap[r.user_id] || `User ${r.user_id}`
      if (status === 'available') available.push(name)
      else if (status === 'if_needed') ifNeeded.push(name)
      else unavailable.push(name)
    }
    // Add members who haven't responded at all
    const respondedIds = new Set(responses.map(r => r.user_id))
    for (const m of members) {
      if (m.user_id && !respondedIds.has(m.user_id)) unavailable.push(m.invite_email + ' (no response)')
    }
    return { available, ifNeeded, unavailable }
  }

  const handleCellClick = (date) => {
    setSelectedDate(prev => prev === date ? null : date)
    onDateClick?.(date)
  }

  const breakdown = selectedDate ? getDateBreakdown(selectedDate) : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontWeight: 600 }}>Availability Overlap</span>
        <span style={{
          fontSize: 12,
          color: overlap.responded_count > 0 && overlap.responded_count < total
            ? '#fbbf24'
            : 'var(--text-secondary)',
        }}>
          {overlap.responded_count > 0
            ? `${overlap.responded_count} of ${total} responded`
            : 'No responses yet'}
        </span>
      </div>

      {/* Suggested windows */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Suggested windows ({windowSize} days)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((w, i) => (
              <button key={i} type="button" className="btn-ghost"
                onClick={() => { onDateClick?.(w.start); setTimeout(() => onDateClick?.(w.end), 10) }}
                style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #2d4a2d', color: 'var(--accent-green)', background: '#1a2a1a' }}>
                {fmtDate(w.start)} – {fmtDate(w.end)}
                <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>
                  {w.minPref}/{total} avail{w.minAll > w.minPref ? `, ${w.minAll - w.minPref} if needed` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {overlap.days.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No availability submitted yet.</div>
      ) : (
        <>
          {Object.entries(byMonth).map(([month, days]) => (
            <div key={month} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                {formatMonth(month)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {days.flatMap((d, idx) => {
                  const prev = days[idx - 1]
                  const isGap = prev && Math.round((new Date(d.date + 'T00:00:00') - new Date(prev.date + 'T00:00:00')) / 86400000) > 1
                  const prefCount = d.pref_count ?? d.count
                  const ifCount = d.count - prefCount
                  const bg = pctColor(prefCount, total)
                  const isSelected = selectedDate === d.date
                  const tooltipParts = []
                  if (prefCount > 0) tooltipParts.push(`${prefCount} available`)
                  if (ifCount > 0) tooltipParts.push(`${ifCount} if needed`)
                  tooltipParts.push(`${total} total`)
                  const tooltip = `${d.date}: ${tooltipParts.join(', ')} — click`
                  const cell = (
                    <div key={d.date} title={tooltip}
                      onClick={() => handleCellClick(d.date)}
                      style={{
                        width: 26, height: 26, borderRadius: 4, background: bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: d.count > 0 ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer', position: 'relative',
                        outline: isSelected ? '2px solid #fff' : '1px solid transparent',
                        transition: 'outline 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.outline = '1px solid var(--accent-green)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.outline = '1px solid transparent' }}
                    >
                      {new Date(d.date + 'T00:00:00').getDate()}
                      {ifCount > 0 && (
                        <span style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: '50%', background: '#cc9900' }} />
                      )}
                    </div>
                  )
                  if (isGap) {
                    return [
                      <div key={`gap-${d.date}`} style={{ width: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 2, height: 14, background: '#333', borderRadius: 1 }} />
                      </div>,
                      cell,
                    ]
                  }
                  return [cell]
                })}
              </div>
            </div>
          ))}

          {/* Date breakdown panel */}
          {breakdown && selectedDate && (
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 14px', marginTop: 8, marginBottom: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{fmtDate(selectedDate)}</div>
              {breakdown.available.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--accent-green)', marginRight: 6 }}>✅ Available:</span>
                  {breakdown.available.map((n, i) => <span key={i} style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{n.split('@')[0]}</span>)}
                </div>
              )}
              {breakdown.ifNeeded.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#cc9900', marginRight: 6 }}>🟡 If needed:</span>
                  {breakdown.ifNeeded.map((n, i) => <span key={i} style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{n.split('@')[0]}</span>)}
                </div>
              )}
              {breakdown.unavailable.length > 0 && (
                <div>
                  <span style={{ color: '#888', marginRight: 6 }}>❌ Unavailable/no response:</span>
                  {breakdown.unavailable.map((n, i) => <span key={i} style={{ color: 'var(--text-muted)', marginRight: 6 }}>{n.split('@')[0]}</span>)}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            {[
              { color: pctColor(0, 1), label: 'None' },
              { color: pctColor(1, 5), label: '≤25%' },
              { color: pctColor(2, 5), label: '26–50%' },
              { color: pctColor(4, 6), label: '51–75%' },
              { color: pctColor(5, 6), label: '76–99%' },
              { color: '#22c55e',      label: 'All' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span>{label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#cc9900', display: 'inline-block' }} />
              <span style={{ color: '#cc9900' }}>if needed</span>
            </div>
          </div>
        </>
      )}

      {budget && (
        <div style={{ marginTop: 14, padding: 12, background: '#1a2a1a', borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Group Budget ({budget.responded_count} responded)</div>
          {budget.median_happy && <div>Happy spend: <strong>${budget.median_happy.toLocaleString()}/person</strong></div>}
          {budget.median_hard && <div>Max stretch: <strong>${budget.median_hard.toLocaleString()}/person</strong></div>}
        </div>
      )}
    </div>
  )
}
