import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

export default function SharePage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/share/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(err => {
        if (err === 404) setError("This trip isn't locked in yet.")
        else setError("Failed to load trip.")
      })
  }, [id])

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: '#fff',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>⛳</div>
        <div style={{ color: '#f87171', fontSize: 18 }}>{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: 'var(--text-secondary)',
      }}>
        Loading trip...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a150a 0%, #0d1117 100%)',
      padding: '40px 20px 80px 20px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
          <h1 style={{
            color: 'var(--accent-green)',
            fontSize: 36,
            margin: '0 0 12px 0',
            fontWeight: 800,
            letterSpacing: -0.5,
          }}>
            {data.trip_name}
          </h1>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
          </div>
          {data.destination_region && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              {data.destination_region}
            </div>
          )}
        </div>

        {/* Who's Going */}
        {data.members && data.members.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Who's Going</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              {data.members.map((m, i) => (
                <span key={i} style={{
                  background: '#1a2a1a',
                  border: '1px solid #2d4a2d',
                  borderRadius: 24,
                  padding: '6px 16px',
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                }}>
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
                <div key={i} style={{
                  background: '#111b11',
                  border: '1px solid #243524',
                  borderRadius: 12,
                  padding: '16px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                        Round {r.round_number}
                        {r.tier && <span style={{ marginLeft: 8, color: 'var(--accent-green)' }}>· {r.tier}</span>}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                        {r.course_name}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {r.course_location}
                      </div>
                    </div>
                    {r.green_fee != null && (
                      <div style={{
                        textAlign: 'right',
                        color: 'var(--accent-green)',
                        fontSize: 20,
                        fontWeight: 800,
                      }}>
                        ${r.green_fee}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>green fee</div>
                      </div>
                    )}
                  </div>
                  {r.website && (
                    <div style={{ marginTop: 12 }}>
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent-green)',
                          fontSize: 13,
                          textDecoration: 'none',
                          opacity: 0.8,
                        }}
                      >
                        Book tee time →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Where We're Staying */}
        {data.lodging && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader>Where We're Staying</SectionHeader>
            <div style={{
              background: '#111b11',
              border: '1px solid #243524',
              borderRadius: 12,
              padding: '16px 20px',
              marginTop: 14,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                {data.lodging.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: 8 }}>
                {data.lodging.type}
                {data.lodging.price_per_night != null && (
                  <span style={{ marginLeft: 8, color: 'var(--accent-green)', fontWeight: 600 }}>
                    · ${data.lodging.price_per_night}/night
                  </span>
                )}
              </div>
              {data.lodging.booking_link && (
                <a
                  href={data.lodging.booking_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent-green)',
                    fontSize: 13,
                    textDecoration: 'none',
                    opacity: 0.8,
                  }}
                >
                  Book lodging →
                </a>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 48 }}>
          Golf Trip Planner
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      borderBottom: '1px solid #1f2d1f',
      paddingBottom: 8,
    }}>
      {children}
    </div>
  )
}
