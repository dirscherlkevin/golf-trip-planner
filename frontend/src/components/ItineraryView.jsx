function fmtTime(t) {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return t
  const h = parseInt(m[1])
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDayLabel(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return iso }
}

export default function ItineraryView({ data }) {
  if (!data?.trip_start || !data?.trip_end) return null

  // Build list of dates
  const days = []
  let cur = new Date(data.trip_start + 'T00:00:00')
  const end = new Date(data.trip_end + 'T00:00:00')
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur.getTime() + 86400000)
  }

  if (days.length === 0) return null

  // Index rounds by round_date
  const roundByDate = {}
  for (const r of (data.rounds || [])) {
    if (r.round_date) roundByDate[r.round_date] = r
  }

  // Index flights by date
  const arrivalsByDate = {}
  const departuresByDate = {}
  for (const m of (data.member_flights || [])) {
    const arr = m.flights?.arrival
    const dep = m.flights?.departure
    if (arr?.date) {
      arrivalsByDate[arr.date] = arrivalsByDate[arr.date] || []
      arrivalsByDate[arr.date].push({ name: m.name, ...arr })
    }
    if (dep?.date) {
      departuresByDate[dep.date] = departuresByDate[dep.date] || []
      departuresByDate[dep.date].push({ name: m.name, ...dep })
    }
  }

  // Sort by time within a day
  const sortByTime = arr => [...arr].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))

  const hasAny = days.some(d => {
    const r = roundByDate[d]
    const arr = arrivalsByDate[d]
    const dep = departuresByDate[d]
    const checkin = d === data.trip_start && data.lodging
    const checkout = d === data.trip_end && data.lodging
    return r || arr?.length || dep?.length || checkin || checkout
  })

  if (!hasAny) return null

  return (
    <div>
      {days.map(day => {
        const round = roundByDate[day]
        const arrivals = sortByTime(arrivalsByDate[day] || [])
        const departures = sortByTime(departuresByDate[day] || [])
        const isCheckin = day === data.trip_start && data.lodging
        const isCheckout = day === data.trip_end && data.lodging
        const restaurants = round?.restaurant_picks?.filter(p => p.up_votes?.length > 0) || []

        const isEmpty = !round && !arrivals.length && !departures.length && !isCheckin && !isCheckout
        if (isEmpty) return null

        return (
          <div key={day} style={{ background: '#111b11', border: '1px solid #1f2f1f', borderRadius: 10, padding: '12px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              {fmtDayLabel(day)}
            </div>

            {isCheckin && (
              <div style={{ fontSize: 13, color: '#6699cc', marginBottom: 6 }}>
                🏠 Check in: <span style={{ color: '#fff' }}>{data.lodging.name}</span>
              </div>
            )}

            {arrivals.map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 5 }}>
                ✈️ <span style={{ color: '#fff' }}>{f.name}</span> arrives
                {fmtTime(f.time) && <span> · {fmtTime(f.time)}</span>}
                {f.airport && <span> · {f.airport}</span>}
                {f.flight_number && <span style={{ color: 'var(--text-muted)' }}> ({f.flight_number})</span>}
              </div>
            ))}

            {round && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
                  ⛳ {round.course_name || 'TBD'}
                  {round.tee_time && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · {round.tee_time.split(',')[0].trim()} tee time</span>}
                </div>
                {restaurants.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, paddingLeft: 18 }}>
                    🍽️ {restaurants.map(r => r.name).join(', ')}
                  </div>
                )}
              </div>
            )}

            {departures.map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 5 }}>
                🛫 <span style={{ color: '#fff' }}>{f.name}</span> departs
                {fmtTime(f.time) && <span> · {fmtTime(f.time)}</span>}
                {f.airport && <span> · {f.airport}</span>}
                {f.flight_number && <span style={{ color: 'var(--text-muted)' }}> ({f.flight_number})</span>}
              </div>
            ))}

            {isCheckout && (
              <div style={{ fontSize: 13, color: '#6699cc', marginBottom: 0, marginTop: arrivals.length || departures.length || round ? 2 : 0 }}>
                🏠 Check out: <span style={{ color: '#fff' }}>{data.lodging.name}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
