import { useState, useEffect, useRef } from 'react'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function isInRanges(date, ranges) {
  return ranges.some(r => date >= r.start && date <= r.end)
}

function isInPreview(date, anchor, hover) {
  if (!anchor || !hover) return false
  const [s, e] = anchor <= hover ? [anchor, hover] : [hover, anchor]
  return date >= s && date <= e
}

function isStartOf(date, ranges) {
  return ranges.some(r => r.start === date)
}

function isEndOf(date, ranges) {
  return ranges.some(r => r.end === date)
}

function formatRange(r) {
  const s = new Date(r.start + 'T00:00:00')
  const e = new Date(r.end + 'T00:00:00')
  const nights = Math.round((e - s) / 86400000)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (nights === 0) return fmt(s)
  return `${fmt(s)} – ${fmt(e)} (${nights} night${nights !== 1 ? 's' : ''})`
}

export default function DateRangePicker({ value, onChange }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  // Drag state kept in both ref (for stable closure) and state (for rendering)
  const dragRef = useRef({ active: false, anchor: null, hover: null })
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  const [dragAnchor, setDragAnchor] = useState(null)
  const [dragHover, setDragHover] = useState(null)

  useEffect(() => {
    const onMouseUp = () => {
      const { active, anchor, hover } = dragRef.current
      if (active && anchor && hover) {
        const [s, e] = anchor <= hover ? [anchor, hover] : [hover, anchor]
        onChangeRef.current([...valueRef.current, { start: s, end: e }])
      }
      dragRef.current = { active: false, anchor: null, hover: null }
      setDragAnchor(null)
      setDragHover(null)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

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

  const removeRange = (i) => onChange(value.filter((_, j) => j !== i))

  // Grid: leading empty cells + days
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Your Available Dates</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Click and drag across days to mark when you can go. Add multiple windows if needed.
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button type="button" onClick={prevMonth} className="btn-ghost"
          style={{ padding: '3px 10px', fontSize: 15 }}>‹</button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={nextMonth} className="btn-ghost"
          style={{ padding: '3px 10px', fontSize: 15 }}>›</button>
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
          const inRange = isInRanges(date, value)
          const inPrev = isInPreview(date, dragAnchor, dragHover)
          const isStart = isStartOf(date, value)
          const isEnd = isEndOf(date, value)

          const bg = inPrev
            ? 'rgba(74,222,128,0.3)'
            : inRange ? 'var(--accent-green)' : '#1e1e1e'
          const color = (inRange && !inPrev) ? '#000' : '#fff'
          const borderColor = inPrev ? 'var(--accent-green)' : inRange ? 'transparent' : '#2a2a2a'
          const borderRadius = inRange
            ? `${isStart ? 6 : 0}px ${isEnd ? 6 : 0}px ${isEnd ? 6 : 0}px ${isStart ? 6 : 0}px`
            : '4px'

          return (
            <div
              key={date}
              onMouseDown={(e) => {
                e.preventDefault()
                dragRef.current = { active: true, anchor: date, hover: date }
                setDragAnchor(date)
                setDragHover(date)
              }}
              onMouseEnter={() => {
                if (dragRef.current.active) {
                  dragRef.current.hover = date
                  setDragHover(date)
                }
              }}
              style={{
                textAlign: 'center',
                padding: '7px 0',
                fontSize: 13,
                cursor: 'pointer',
                background: bg,
                color,
                border: `1px solid ${borderColor}`,
                borderRadius,
                transition: 'background 0.08s',
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      {/* Selected ranges */}
      {value.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Selected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {value.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  background: '#1a2a1a', border: '1px solid #2d4a2d',
                  padding: '3px 10px', borderRadius: 4,
                  fontSize: 12, color: 'var(--accent-green)',
                }}>
                  {formatRange(r)}
                </span>
                <button type="button" onClick={() => removeRange(i)} className="btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 11, color: '#888', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
