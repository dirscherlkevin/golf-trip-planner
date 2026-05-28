import { useEffect, useState } from 'react'
import { getOverlap, getAvailability } from '../../api/availability'
import { useAuthStore } from '../../store/auth'

export default function OverlapHeatmap({ trip }) {
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id
  const [overlap, setOverlap] = useState(null)
  const [budget, setBudget] = useState(null)

  useEffect(() => {
    if (!trip) return
    getOverlap(trip.id).then(setOverlap).catch(() => {})
    if (isOrganizer) {
      getAvailability(trip.id).then(d => setBudget(d.budget)).catch(() => {})
    }
  }, [trip?.id, isOrganizer])

  if (!overlap) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading heatmap...</div>

  const max = Math.max(...overlap.days.map(d => d.count), 1)

  // Group days by month for display
  const byMonth = {}
  for (const d of overlap.days) {
    const month = d.date.slice(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(d)
  }

  const getColor = (count) => {
    if (count === 0) return '#1a1a1a'
    const ratio = count / max
    // green scale
    const g = Math.round(74 + ratio * (180 - 74))
    return `rgb(30, ${g}, 30)`
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Availability Overlap</div>
      {overlap.days.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No availability submitted yet. {overlap.total_members} member(s) in group.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {overlap.days.map(d => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}/${overlap.total_members} available`}
              style={{
                width: 28, height: 28, borderRadius: 4,
                background: getColor(d.count),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: d.count > 0 ? '#fff' : 'var(--text-muted)',
                cursor: 'default',
              }}
            >
              {new Date(d.date + 'T00:00:00').getDate()}
            </div>
          ))}
        </div>
      )}
      {isOrganizer && budget && (
        <div style={{ marginTop: 14, padding: 12, background: '#1a2a1a', borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Group Budget Summary ({budget.responded_count} responded)</div>
          {budget.median_happy && <div>Median happy spend: <strong>${budget.median_happy.toLocaleString()}</strong></div>}
          {budget.median_hard && <div>Median hard limit: <strong>${budget.median_hard.toLocaleString()}</strong></div>}
          {budget.min_hard && budget.max_hard && (
            <div>Hard limit range: <strong>${budget.min_hard.toLocaleString()} – ${budget.max_hard.toLocaleString()}</strong></div>
          )}
        </div>
      )}
    </div>
  )
}
