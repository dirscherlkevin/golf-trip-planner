import { useState } from 'react'

export default function DateRangePicker({ value, onChange }) {
  // value: [{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}]
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  const addRange = () => {
    setError('')
    if (!start || !end) { setError('Please select both start and end dates'); return }
    if (end < start) { setError('End date must be after start date'); return }
    onChange([...value, { start, end }])
    setStart('')
    setEnd('')
  }

  const removeRange = (i) => {
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Your Available Dates</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
        <span style={{ color: 'var(--text-secondary)' }}>to</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
        <button type="button" className="btn-primary" onClick={addRange}>Add Range</button>
      </div>
      {error && <div style={{ color: '#e55', marginTop: 6, fontSize: 13 }}>{error}</div>}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ background: '#2d4a2d', padding: '3px 10px', borderRadius: 4 }}>
              {r.start} → {r.end}
            </span>
            <button type="button" className="btn-ghost" onClick={() => removeRange(i)}
              style={{ padding: '2px 8px', fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
