import { useEffect, useState } from 'react'
import { getOverlap } from '../../api/availability'

export default function OverlapHeatmap({ trip, budget, onDateClick }) {
  const [overlap, setOverlap] = useState(null)

  useEffect(() => {
    if (!trip) return
    getOverlap(trip.id).then(setOverlap).catch(() => {})
  }, [trip?.id])

  if (!overlap) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading heatmap...</div>

  const max = Math.max(...overlap.days.map(d => d.count), 1)
  const getColor = (count) => {
    if (count === 0) return '#1a1a1a'
    const ratio = count / max
    const g = Math.round(74 + ratio * (180 - 74))
    return `rgb(30, ${g}, 30)`
  }

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontWeight: 600 }}>Availability Overlap</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {overlap.days.filter(d => d.count > 0).length > 0
            ? `${overlap.total_members} members in group`
            : 'No responses yet'}
        </span>
      </div>

      {overlap.days.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No availability submitted yet.
        </div>
      ) : (
        <>
          {Object.entries(byMonth).map(([month, days]) => (
            <div key={month} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                {formatMonth(month)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {days.map(d => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}/${overlap.total_members} available${onDateClick ? ' — click to select' : ''}`}
                    onClick={() => onDateClick?.(d.date)}
                    style={{
                      width: 26, height: 26, borderRadius: 4,
                      background: getColor(d.count),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: d.count > 0 ? '#fff' : 'var(--text-muted)',
                      cursor: onDateClick ? 'pointer' : 'default',
                      outline: onDateClick ? '1px solid transparent' : undefined,
                    }}
                    onMouseEnter={e => { if (onDateClick) e.currentTarget.style.outline = '1px solid var(--accent-green)' }}
                    onMouseLeave={e => { if (onDateClick) e.currentTarget.style.outline = '1px solid transparent' }}
                  >
                    {new Date(d.date + 'T00:00:00').getDate()}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {onDateClick && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginBottom: 2 }}>
              Click a day to pre-fill start/end dates below
            </div>
          )}
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: getColor(1) }}/>
              <span>1 person</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: getColor(Math.ceil(max / 2)) }}/>
              <span>half</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: getColor(max) }}/>
              <span>everyone</span>
            </div>
          </div>
        </>
      )}

      {/* Budget aggregate (passed as prop from organizer) */}
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
