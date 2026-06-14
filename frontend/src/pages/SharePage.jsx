import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import NotesEditor from '../components/NotesEditor'
import ItineraryView from '../components/ItineraryView'

const VIBE_BADGE = {
  top_rated:  { label: '⭐ Top Rated', color: '#cc9900', bg: 'rgba(204,153,0,0.1)',    border: 'rgba(204,153,0,0.3)' },
  hidden_gem: { label: '💎 Hidden Gem', color: '#6699cc', bg: 'rgba(102,153,204,0.1)', border: 'rgba(102,153,204,0.3)' },
  both:       { label: '⭐💎 Both',     color: '#5a9a5a', bg: 'rgba(90,154,90,0.1)',   border: 'rgba(90,154,90,0.3)' },
}

function RestaurantPicks({ picks, label }) {
  if (!picks || picks.length === 0) return null
  return (
    <div style={{ marginTop: 14, padding: '10px 12px', background: '#0a150a', border: '1px solid #1d3a1d', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: '#5a9a5a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🍽️ {label}</div>
      <div style={{ fontSize: 10, color: '#446644', fontStyle: 'italic', marginBottom: 6 }}>
        AI-generated suggestions — verify hours and address before you go
      </div>
      {picks.map((pick, i) => {
        const badge = VIBE_BADGE[pick.vibe]
        return (
          <div key={pick.id || i} style={{ background: '#111', border: '1px solid #1d3a1d', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
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
            </div>
            {pick.reason && (
              <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{pick.reason}"</div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {pick.maps_url && (
                <a href={pick.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
              )}
              {pick.phone && <span style={{ fontSize: 11, color: '#666' }}>{pick.phone}</span>}
              {pick.up_votes?.length > 0 && (
                <span style={{ fontSize: 10, color: '#5a9a5a', marginLeft: 'auto' }}>👍 {pick.up_votes.length}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SharePage() {
  const { id } = useParams()
  const user = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${import.meta.env.VITE_API_URL || ''}/share/${id}`, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setData(d)
        document.title = `${d.trip_name} — Golf Trip`
        const ogTags = [
          { property: 'og:title', content: `⛳ ${d.trip_name}` },
          { property: 'og:description', content: `${d.dates || ''} · ${d.destination || ''} · ${d.rounds?.length ?? 0} rounds` },
          { property: 'og:type', content: 'website' },
        ]
        ogTags.forEach(({ property, content }) => {
          let el = document.querySelector(`meta[property="${property}"]`)
          if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el) }
          el.setAttribute('content', content)
        })
      })
      .catch(err => {
        if (err === 404) setError("This trip isn't locked in yet.")
        else setError("Failed to load trip.")
      })
  }, [id, token])

  const isMember = !!(user && data?.is_member)

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#fff', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 48 }}>⛳</div>
        <div style={{ color: '#f87171', fontSize: 18 }}>{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: 'var(--text-secondary)' }}>
        Loading trip...
      </div>
    )
  }

  const mapLink = (name, location) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, location].filter(Boolean).join(' '))}`


  const handleEmail = () => {
    const subject = encodeURIComponent(`${data.trip_name} — Golf Trip!`)
    const lines = [
      `Hey crew!`,
      ``,
      `Here are the details for ${data.trip_name}:`,
      ``,
      data.dates ? `📅 Dates: ${data.dates}` : null,
      data.destination ? `📍 Destination: ${data.destination}${data.destination_region ? ` (${data.destination_region})` : ''}` : null,
      ``,
      data.members?.length ? `👥 Who's Going: ${data.members.join(', ')}` : null,
      ``,
      data.total_per_person ? `💰 Est. cost per person: $${Math.round(data.total_per_person).toLocaleString()}${data.total_course_per_person ? ` (rounds: $${Math.round(data.total_course_per_person).toLocaleString()}${data.lodging_per_person ? `, lodging: $${Math.round(data.lodging_per_person).toLocaleString()}` : ''})` : ''}` : null,
      ``,
      data.rounds?.length ? `⛳ THE COURSES` : null,
      ...(data.rounds || []).flatMap(r => [
        `Round ${r.round_number}: ${r.course_name}${r.course_location ? ` — ${r.course_location}` : ''}`,
        r.green_fee ? `  Green fee: $${r.green_fee}${r.cart_fee ? ` + $${r.cart_fee} cart` : ''}` : null,
        r.tee_time ? `  Tee time: ${r.tee_time}${r.round_date ? ` on ${r.round_date}` : ''} (local time)` : null,
        r.website ? `  Book: ${r.website}` : null,
        (r.course_name || r.course_location) ? `  Map: ${mapLink(r.course_name, r.course_location)}` : null,
        r.notes ? `  Notes: ${r.notes}` : null,
      ].filter(Boolean).join('\n')),
      ``,
      data.lodging ? `🏠 WHERE WE'RE STAYING` : null,
      data.lodging ? `${data.lodging.name}${data.lodging.type ? ` (${data.lodging.type})` : ''}` : null,
      data.lodging?.price_per_night ? `  $${data.lodging.price_per_night}/night total` : null,
      data.lodging_per_person ? `  ~$${Math.round(data.lodging_per_person).toLocaleString()}/person for the trip` : null,
      (data.lodging?.website || data.lodging?.booking_link) ? `  Website: ${data.lodging.website || data.lodging.booking_link}` : null,
      (data.lodging?.address || data.lodging?.name) ? `  Map: ${mapLink(data.lodging.address || data.lodging.name, '')}` : null,
      data.lodging?.notes ? `  Notes: ${data.lodging.notes}` : null,
      ``,
      `See full trip details: ${window.location.href}`,
    ].filter(l => l !== null).join('\n')
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(lines)}`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a150a 0%, #0d1117 100%)', padding: '40px 20px 80px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
          <h1 style={{ color: 'var(--accent-green)', fontSize: 36, margin: '0 0 12px 0', fontWeight: 800, letterSpacing: -0.5 }}>
            {data.trip_name}
          </h1>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
          </div>
          {data.destination_region && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{data.destination_region}</div>
          )}
          {/* AI trip summary — auto-generated at finalization */}
          {data.share_tagline && (
            <div style={{ marginTop: 20, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic', maxWidth: 480, margin: '20px auto 0' }}>
              "{data.share_tagline}"
            </div>
          )}

          {/* Per-person cost banner */}
          {data.total_per_person > 0 && (
            <div style={{ marginTop: 16, display: 'inline-flex', flexDirection: 'column', gap: 4, background: '#111f11', border: '1px solid #2d4a2d', borderRadius: 10, padding: '12px 24px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Est. cost per person</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-green)' }}>
                ${Math.round(data.total_per_person).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {data.total_course_per_person > 0 && <span>Rounds: ${Math.round(data.total_course_per_person).toLocaleString()}</span>}
                {data.lodging_per_person > 0 && <span>· Lodging: ${Math.round(data.lodging_per_person).toLocaleString()}</span>}
              </div>
            </div>
          )}
          {data.total_per_person > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>
              Fees are AI-estimated — verify before booking
            </div>
          )}
          {isMember && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              You're a member of this trip — you can edit notes below.
            </div>
          )}
        </div>

        {/* Who's Going */}
        {data.members && data.members.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Who's Going</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              {data.members.map((m, i) => (
                <span key={i} style={{ background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 24, padding: '6px 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
                  {m}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* The Courses */}
        {data.rounds && data.rounds.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>The Courses</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {data.rounds.map((r, i) => (
                <div key={i} style={{ background: '#111b11', border: '1px solid #243524', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                        Round {r.round_number}
                        {r.tier && <span style={{ marginLeft: 8, color: 'var(--accent-green)' }}>· {r.tier}</span>}
                        {r.ranking && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#cc9900', background: 'rgba(204,153,0,0.1)', border: '1px solid rgba(204,153,0,0.3)', borderRadius: 4, padding: '1px 5px' }}>
                            {r.ranking}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{r.course_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{r.course_location}</div>
                      {(r.rating || r.slope || r.par) && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                          {[r.rating && `Rating ${r.rating}`, r.slope && `Slope ${r.slope}`, r.par && `Par ${r.par}`].filter(Boolean).join(' · ')}
                          {r.rating_source && <span style={{ color: 'var(--text-muted)', marginLeft: 5 }}>({r.rating_source})</span>}
                        </div>
                      )}
                      {r.yardage_options && (r.yardage_options.championship || r.yardage_options.member || r.yardage_options.forward) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                          Yardage: {[
                            r.yardage_options.championship && `${r.yardage_options.championship.toLocaleString()} (champ)`,
                            r.yardage_options.member && `${r.yardage_options.member.toLocaleString()} (member)`,
                            r.yardage_options.forward && `${r.yardage_options.forward.toLocaleString()} (fwd)`,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {r.architect && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Architect: {r.architect}</div>}
                      {r.walking_policy && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Walking: {r.walking_policy}</div>}
                      {r.tee_time && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                          🕐 {r.tee_time}{r.round_date ? ` · ${r.round_date}` : ''} <span style={{ color: 'var(--text-muted)' }}>(local time)</span>
                        </div>
                      )}
                    </div>
                    {r.green_fee != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: 'var(--accent-green)', fontSize: 20, fontWeight: 800 }}>${r.green_fee}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>green fee (est.)</div>
                        {r.cart_fee != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+${r.cart_fee} cart</div>}
                      </div>
                    )}
                  </div>
                  <NotesEditor
                    initialNotes={r.notes}
                    readOnly={!isMember}
                    onSave={async (notes) => {
                      await client.patch(`/trips/${data.trip_id}/rounds/${r.round_id}/notes`, { notes })
                    }}
                  />
                  <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)', fontSize: 13, textDecoration: 'none', opacity: 0.8 }}>
                        Book tee time →
                      </a>
                    )}
                    {(r.course_name || r.course_location) && (
                      <a href={mapLink(r.course_name, r.course_location)} target="_blank" rel="noopener noreferrer" style={{ color: '#6699cc', fontSize: 13, textDecoration: 'underline' }}>
                        📍 Map
                      </a>
                    )}
                  </div>
                  <RestaurantPicks picks={r.restaurant_picks} label="Dinner picks — after this round" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Where We're Staying */}
        {data.lodging && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Where We're Staying</SectionHeader>
            <div style={{ background: '#111b11', border: '1px solid #243524', borderRadius: 12, padding: '16px 20px', marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{data.lodging.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: 8 }}>
                    {data.lodging.type}
                    {data.lodging.price_per_night != null && (
                      <span style={{ marginLeft: 8, color: 'var(--accent-green)', fontWeight: 600 }}>
                        · ${data.lodging.price_per_night}/night
                      </span>
                    )}
                  </div>
                  {(data.lodging.beds || data.lodging.rooms) && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {data.lodging.rooms && <span>{data.lodging.rooms} rooms · </span>}
                      {data.lodging.beds && <span>{data.lodging.beds} beds</span>}
                    </div>
                  )}
                </div>
                {data.lodging_per_person > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#90cdf4' }}>
                      ~${Math.round(data.lodging_per_person).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>per person</div>
                  </div>
                )}
              </div>
              {(data.trip_start || data.trip_end) && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 4 }}>
                  {data.trip_start && (
                    <span>Check in: {new Date(data.trip_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  )}
                  {data.trip_start && data.trip_end && <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>}
                  {data.trip_end && (
                    <span>Check out: {new Date(data.trip_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
              )}
              <NotesEditor
                initialNotes={data.lodging.notes}
                readOnly={!isMember}
                onSave={async (notes) => {
                  await client.patch(`/trips/${data.trip_id}/lodging/options/${data.lodging.option_id}`, { notes: notes || null })
                }}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {(data.lodging.website || data.lodging.booking_link) && (
                  <a href={data.lodging.website || data.lodging.booking_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)', fontSize: 13, textDecoration: 'none', opacity: 0.8 }}>
                    🌐 Visit website →
                  </a>
                )}
                {(data.lodging.address || data.lodging.name) && (
                  <a href={mapLink(data.lodging.address || data.lodging.name, '')} target="_blank" rel="noopener noreferrer" style={{ color: '#6699cc', fontSize: 13, textDecoration: 'underline' }}>
                    📍 Map
                  </a>
                )}
              </div>
              <RestaurantPicks picks={data.restaurant_lodging_picks} label="Dining picks — near lodging" />
            </div>
          </section>
        )}

        {/* Day-by-Day Itinerary */}
        {data.trip_start && data.trip_end && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Day-by-Day Itinerary</SectionHeader>
            <div style={{ marginTop: 14 }}>
              <ItineraryView data={data} />
            </div>
          </section>
        )}

        {/* Crew Flights */}
        {data.member_flights?.some(m => m.flights?.arrival || m.flights?.departure) && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Crew Flights</SectionHeader>
            <div style={{ marginTop: 14 }}>
              {(() => {
                const fmtTime = t => { if (!t) return null; const m = t.match(/^(\d{1,2}):(\d{2})$/); if (!m) return t; const h = parseInt(m[1]); return `${h%12||12}:${m[2]} ${h>=12?'PM':'AM'}` }
                const fmtDateHdr = iso => { try { return new Date(iso+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) } catch { return iso } }
                const all = []
                data.member_flights.forEach(m => {
                  if (m.flights?.arrival) all.push({ ...m.flights.arrival, icon: '✈️', name: m.name })
                  if (m.flights?.departure) all.push({ ...m.flights.departure, icon: '🛫', name: m.name })
                })
                all.sort((a, b) => ((a.date||'9999')+(a.time||'99:99')).localeCompare((b.date||'9999')+(b.time||'99:99')))
                const groups = {}, order = []
                all.forEach(f => { const k = f.date||''; if (!groups[k]) { groups[k]=[]; order.push(k) } groups[k].push(f) })
                return order.map(day => (
                  <div key={day} style={{ background: '#111b11', border: '1px solid #243524', borderRadius: 10, padding: '12px 16px', marginBottom: 10 }}>
                    {day && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{fmtDateHdr(day)}</div>}
                    {groups[day].map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginBottom: i < groups[day].length-1 ? 6 : 0 }}>
                        <span>{f.icon}</span>
                        <span style={{ color: '#fff', minWidth: 68 }}>{fmtTime(f.time) || '—'}</span>
                        <span>{[f.flight_number, f.airport].filter(Boolean).join(' · ')}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', paddingLeft: 8 }}>— {f.name}</span>
                      </div>
                    ))}
                  </div>
                ))
              })()}
            </div>
          </section>
        )}

        {/* Email export */}
        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 24, borderTop: '1px solid #1f2d1f' }}>
          <button onClick={handleEmail} style={{ background: '#1a2a1a', border: '1px solid var(--accent-green)', borderRadius: 8, color: 'var(--accent-green)', fontSize: 13, padding: '10px 20px', cursor: 'pointer' }}>
            ✉️ Compose Email to Crew
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 24 }}>
          Par-Tee Planner
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, borderBottom: '1px solid #1f2d1f', paddingBottom: 8 }}>
      {children}
    </div>
  )
}
