import { useState, useEffect } from 'react'
import client from '../api/client'

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function heatmapColor(count, total) {
  if (count === 0) return { bg: '#1a202c', text: 'var(--text-muted)' }
  const ratio = count / total
  if (ratio === 1) return { bg: '#22543d', text: '#9ae6b4' }
  if (ratio >= 0.5) return { bg: '#276749', text: 'var(--accent-green)' }
  return { bg: '#744210', text: 'var(--accent-amber)' }
}

export default function AvailabilityCalendar({ tripId, totalMembers }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [overlap, setOverlap] = useState({})
  const [selectedDates, setSelectedDates] = useState(new Set())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    client.get(`/trips/${tripId}/availability/overlap`).then((r) => {
      const map = {}
      r.data.days.forEach((d) => { map[d.date] = d.count })
      setOverlap(map)
    })
  }, [tripId])

  const toggleDate = (dateStr) => {
    setSaved(false)
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  const saveAvailability = async () => {
    if (selectedDates.size === 0) return
    const sorted = [...selectedDates].sort()
    // Convert individual dates to ranges
    const ranges = []
    let start = sorted[0], prev = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]
      const prevDate = new Date(prev)
      const currDate = new Date(curr)
      const diff = (currDate - prevDate) / (1000 * 60 * 60 * 24)
      if (diff === 1) { prev = curr }
      else { ranges.push({ start_date: start, end_date: prev }); start = curr; prev = curr }
    }
    ranges.push({ start_date: start, end_date: prev })
    await client.post(`/trips/${tripId}/availability`, { date_ranges: ranges })
    setSaved(true)
    const r = await client.get(`/trips/${tripId}/availability/overlap`)
    const map = {}
    r.data.days.forEach((d) => { map[d.date] = d.count })
    setOverlap(map)
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' })
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div style={{ flex: 1, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="label">Group Availability — {monthName} {year}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}>
            ‹
          </button>
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}>
            ›
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 12 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
        ))}
        {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr = formatDate(year, month, day)
          const count = overlap[dateStr] || 0
          const { bg, text } = heatmapColor(count, totalMembers || 1)
          const isSelected = selectedDates.has(dateStr)
          return (
            <div
              key={day}
              onClick={() => toggleDate(dateStr)}
              style={{
                background: isSelected ? 'var(--btn-primary)' : bg,
                color: isSelected ? '#fff' : text,
                borderRadius: 4, padding: '6px 2px', textAlign: 'center',
                fontSize: 11, cursor: 'pointer', border: isSelected ? '2px solid var(--accent-blue)' : '2px solid transparent',
                fontWeight: count > 0 ? 600 : 400,
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['#22543d', '#9ae6b4', 'All available'], ['#276749', 'var(--accent-green)', 'Most available'],
          ['#744210', 'var(--accent-amber)', 'Some available'], ['#1a202c', 'var(--text-muted)', 'Unavailable']
        ].map(([bg, text, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, background: bg, borderRadius: 2 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Click dates to mark your availability
          {selectedDates.size > 0 && ` — ${selectedDates.size} day(s) selected`}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--accent-green)', fontSize: 12 }}>✓ Saved</span>}
          <button className="btn-primary" onClick={saveAvailability} disabled={selectedDates.size === 0}>
            Save My Availability
          </button>
        </div>
      </div>
    </div>
  )
}
