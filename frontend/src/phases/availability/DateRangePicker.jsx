import { useState, useEffect } from 'react'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const STATE_BG = { available: 'var(--accent-green)', if_needed: '#cc9900' }
const STATE_BORDER = { available: 'var(--accent-green)', if_needed: '#cc9900' }

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

// Expand [{start, end, type}] ranges into Map<iso, type>
function rangesToMap(ranges) {
  const map = new Map()
  for (const r of ranges) {
    const type = r.type || 'available'
    let cur = new Date(r.start + 'T00:00:00')
    const end = new Date(r.end + 'T00:00:00')
    while (cur <= end) {
      map.set(cur.toISOString().slice(0, 10), type)
      cur = new Date(cur.getTime() + 86400000)
    }
  }
  return map
}

// Collapse Map<iso, type> into [{start, end, type}] — consecutive same-type days merged
function mapToRanges(map) {
  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (!sorted.length) return []
  const ranges = []
  let [start, type] = sorted[0]
  let end = start
  for (let i = 1; i < sorted.length; i++) {
    const [date, t] = sorted[i]
    const prev = new Date(sorted[i - 1][0] + 'T00:00:00')
    const curr = new Date(date + 'T00:00:00')
    if (Math.round((curr - prev) / 86400000) === 1 && t === type) {
      end = date
    } else {
      ranges.push({ start, end, type })
      start = date; end = date; type = t
    }
  }
  ranges.push({ start, end, type })
  return ranges
}

function buildSummary(map) {
  const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const availParts = [], ifParts = []
  let totalAvail = 0, totalIf = 0
  for (const r of mapToRanges(map)) {
    const label = r.start === r.end ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end)}`
    const days = Math.round((new Date(r.end + 'T00:00:00') - new Date(r.start + 'T00:00:00')) / 86400000) + 1
    if (r.type === 'available') { availParts.push(label); totalAvail += days }
    else { ifParts.push(label); totalIf += days }
  }
  return { availParts, ifParts, totalAvail, totalIf }
}

export default function DateRangePicker({ value, onChange }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedMap, setSelectedMap] = useState(() => rangesToMap(value))
  const [synced, setSynced] = useState(() => value.length > 0)

  // Sync once from parent when data first arrives (e.g. API loads after mount)
  useEffect(() => {
    if (!synced && value.length > 0) {
      setSelectedMap(rangesToMap(value))
      setSynced(true)
    }
  }, [value, synced])

  const toggleDay = (date) => {
    const next = new Map(selectedMap)
    const cur = next.get(date)
    if (!cur) next.set(date, 'available')
    else if (cur === 'available') next.set(date, 'if_needed')
    else next.delete(date)
    setSelectedMap(next)
    onChange(mapToRanges(next))
  }

  const clearAll = () => {
    setSelectedMap(new Map())
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

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const { availParts, ifParts, totalAvail, totalIf } =
    selectedMap.size > 0 ? buildSummary(selectedMap) : { availParts: [], ifParts: [], totalAvail: 0, totalIf: 0 }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Your Available Dates</div>

      {/* Legend / instructions */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, flexWrap: 'wrap' }}>
        <span>Click once:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-green)', display: 'inline-block' }} />
          <span style={{ color: 'var(--accent-green)' }}>Available</span>
        </span>
        <span>· again:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#cc9900', display: 'inline-block' }} />
          <span style={{ color: '#cc9900' }}>If Needed</span>
        </span>
        <span>· again: off</span>
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
          const state = selectedMap.get(date)
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
                background: state ? STATE_BG[state] : '#1e1e1e',
                color: state ? '#000' : '#fff',
                border: `1px solid ${state ? STATE_BORDER[state] : '#2a2a2a'}`,
                fontWeight: state ? 700 : 400,
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
        {selectedMap.size === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No days selected yet.</div>
        ) : (
          <div>
            {totalAvail > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Available ({totalAvail} day{totalAvail !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {availParts.map((p, i) => (
                    <span key={i} style={{
                      background: '#1a2a1a', border: '1px solid #2d4a2d',
                      padding: '3px 10px', borderRadius: 4,
                      fontSize: 12, color: 'var(--accent-green)',
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            )}
            {totalIf > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  If Needed ({totalIf} day{totalIf !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ifParts.map((p, i) => (
                    <span key={i} style={{
                      background: '#2a2010', border: '1px solid #4a3a10',
                      padding: '3px 10px', borderRadius: 4,
                      fontSize: 12, color: '#cc9900',
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            )}
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
