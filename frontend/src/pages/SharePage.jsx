import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

function NotesEditor({ initialNotes, onSave, readOnly }) {
  const [text, setText] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(text.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { }
    finally { setSaving(false) }
  }

  if (readOnly) {
    if (!text) return null
    return (
      <div style={{ marginTop: 10, padding: '8px 10px', background: '#0d170d', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add notes..."
        rows={text ? Math.max(2, text.split('\n').length) : 2}
        style={{ width: '100%', padding: '6px 10px', background: '#0d170d', border: '1px solid #2a3a2a', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <button className="btn-ghost" disabled={saving} onClick={handleSave} style={{ fontSize: 11, padding: '2px 10px' }}>
          {saving ? '...' : 'Save notes'}
        </button>
        {saved && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}

export default function SharePage() {
  const { id } = useParams()
  const user = useAuthStore(s => s.user)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/share/${id}`)
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
  }, [id])

  const isMember = !!(user && data?.member_ids?.includes(user.id))

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
      data.lodging?.booking_link ? `  Book: ${data.lodging.booking_link}` : null,
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                        Round {r.round_number}
                        {r.tier && <span style={{ marginLeft: 8, color: 'var(--accent-green)' }}>· {r.tier}</span>}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{r.course_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.course_location}</div>
                      {r.tee_time && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                          🕐 {r.tee_time}{r.round_date ? ` · ${r.round_date}` : ''} <span style={{ color: 'var(--text-muted)' }}>(local time)</span>
                        </div>
                      )}
                    </div>
                    {r.green_fee != null && (
                      <div style={{ textAlign: 'right', color: 'var(--accent-green)', fontSize: 20, fontWeight: 800 }}>
                        ${r.green_fee}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>green fee</div>
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
              <NotesEditor
                initialNotes={data.lodging.notes}
                readOnly={!isMember}
                onSave={async (notes) => {
                  await client.patch(`/trips/${data.trip_id}/lodging/options/${data.lodging.option_id}`, { notes: notes || null })
                }}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {data.lodging.booking_link && (
                  <a href={data.lodging.booking_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-green)', fontSize: 13, textDecoration: 'none', opacity: 0.8 }}>
                    Book lodging →
                  </a>
                )}
                {(data.lodging.address || data.lodging.name) && (
                  <a href={mapLink(data.lodging.address || data.lodging.name, '')} target="_blank" rel="noopener noreferrer" style={{ color: '#6699cc', fontSize: 13, textDecoration: 'underline' }}>
                    📍 Map
                  </a>
                )}
              </div>
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
