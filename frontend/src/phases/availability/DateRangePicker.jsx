import { useState, useEffect } from 'react'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

// Expand [{start,end}] ranges into a Set of ISO date strings
function rangesToDays(ranges) {
  const days = new Set()
  for (const r of ranges) {
    let cur = new Date(r.start + 'T00:00:00')
    const end = new Date(r.end + 'T00:00:00')
    while (cur <= end) {
      days.add(cur.toISOString().slice(0, 10))
      cur = new Date(cur.getTime() + 86400000)
    }
  }
  return days
}

// Collapse a Set of ISO date strings into consecutive [{start,end}] ranges
function daysToRanges(days) {
  const sorted = [...days].sort()
  if (!sorted.length) return []
  const ranges = []
  let start = sorted[0], end = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00')
    const curr = new Date(sorted[i] + 'T00:00:00')
    if (Math.round((curr - prev) / 86400000) === 1) {
      end = sorted[i]
    } else {
      ranges.push({ start, end })
      start = sorted[i]; end = sorted[i]
    }
  }
  ranges.push({ start, end })
  return ranges
}

function formatRangeSummary(ranges) {
  const total = ranges.reduce((n, r) => {
    return n + Math.round((new Date(r.end + 'T00:00:00') - new Date(r.start + 'T00:00:00')) / 86400000) + 1
  }, 0)
  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const parts = ranges.map(r =>
    r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`
  )
  return { parts, total }
}

export default function DateRangePicker({ value, onChange }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  // Internal state: Set of selected ISO date strings
  const [selectedDays, setSelectedDays] = useState(() => rangesToDays(value))

  // If parent loads saved data (e.g. from API), sync into selectedDays once
  useEffect(() => {
    if (value.length > 0) setSelectedDays(rangesToDays(value))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (date) => {
    const next = new Set(selectedDays)
    if (next.has(date)) next.delete(date)
    else next.add(date)
    setSelectedDays(next)
    onChange(daysToRanges(next))
  }

  const clearAll = () => {
    setSelectedDays(new Set())
    onChange([])
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = new Date(year, month, 1).getDay()

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Build grid
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const ranges = daysToRanges(selectedDays)
  const { parts, total } = selectedDays.size > 0 ? formatRangeSummary(ranges) : { parts: [], total: 0 }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Your Available Dates</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Click any day to mark it available. Click again to remove it. Navigate months with the arrows.
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button type="button" onClick={prevMonth} className="btn-ghost" style={{ padding: '3px 12px', fontSize: 16 }}>‹</button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={nextMonth} className="btn-ghost" style={{ padding: '3px 12px', fontSize: 16 }}>›</button>
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, userSelect: 'none' }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', paddingBottom: 4, fontWeight: 600 }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const date = toISO(year, month, day)
          const selected = selectedDays.has(date)
          return (
            <div
              key={date}
              onClick={() => toggleDay(date)}
              style={{
                textAlign: 'center',
                padding: '8px 0',
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: 5,
                background: selected ? 'var(--accent-green)' : '#1e1e1e',
                color: selected ? '#000' : '#fff',
                border: `1px solid ${selected ? 'var(--accent-green)' : '#2a2a2a'}`,
                fontWeight: selected ? 700 : 400,
                transition: 'background 0.1s',
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div style={{ marginTop: 14, minHeight: 40 }}>
        {selectedDays.size === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No days selected yet.</div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Selected ({total} day{total !== 1 ? 's' : ''})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {parts.map((p, i) => (
                <span key={i} style={{
                  background: '#1a2a1a', border: '1px solid #2d4a2d',
                  padding: '3px 10px', borderRadius: 4,
                  fontSize: 12, color: 'var(--accent-green)',
                }}>{p}</span>
              ))}
            </div>
            <button type="button" onClick={clearAll} className="btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', color: '#888' }}>
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
