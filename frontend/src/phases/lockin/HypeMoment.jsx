import { useState, useEffect } from 'react'

function useCopyToClipboard(text) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: open share URL in new tab
      window.open(text, '_blank')
    }
  }
  return [copied, copy]
}

export default function HypeMoment({ trip }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const shareUrl = `${window.location.origin}/share/${trip.id}`
  const [copied, copyToClipboard] = useCopyToClipboard(shareUrl)

  useEffect(() => {
    fetch('/share/' + trip.id)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load trip summary.'); setLoading(false) })
  }, [trip.id])

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a2a1a 0%, #0a1a0a 100%)',
      border: '2px solid var(--accent-green)',
      borderRadius: 16,
      padding: 40,
      textAlign: 'center',
      marginTop: 24,
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
      <h1 style={{ color: 'var(--accent-green)', fontSize: 36, marginBottom: 8, margin: '0 0 8px 0' }}>
        We're Going!
      </h1>
      <div style={{ fontSize: 20, color: '#fff', marginBottom: 4, fontWeight: 600 }}>
        {trip.name}
      </div>

      {loading && (
        <div style={{ color: 'var(--text-secondary)', marginTop: 24 }}>Loading trip summary...</div>
      )}

      {error && (
        <div style={{ color: '#f87171', marginTop: 24 }}>{error}</div>
      )}

      {data && (
        <>
          {/* Dates + destination */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 15, marginTop: 12, marginBottom: 24 }}>
            {data.dates && <span>{data.dates}</span>}
            {data.dates && data.destination && <span style={{ margin: '0 10px' }}>·</span>}
            {data.destination && <span>{data.destination}</span>}
            {data.destination_region && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({data.destination_region})</span>
            )}
          </div>

          {/* Who's going */}
          {data.members && data.members.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Who's Going
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {data.members.map((m, i) => (
                  <span key={i} style={{
                    background: '#1f3b1f',
                    border: '1px solid #2d5c2d',
                    borderRadius: 20,
                    padding: '4px 14px',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}>{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Courses */}
          {data.rounds && data.rounds.length > 0 && (
            <div style={{ marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
                The Courses
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.rounds.map((r, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid #2d4a2d',
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>
                        Round {r.round_number}: {r.course_name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                        {r.course_location}
                        {r.tier && <span style={{ marginLeft: 8, color: 'var(--accent-green)', textTransform: 'capitalize' }}>· {r.tier}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {r.green_fee != null && (
                        <div style={{ color: 'var(--accent-green)', fontWeight: 700 }}>${r.green_fee}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lodging */}
          {data.lodging && (
            <div style={{ marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
                Where We're Staying
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #2d4a2d',
                borderRadius: 10,
                padding: '12px 16px',
              }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>{data.lodging.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>
                  {data.lodging.type}
                  {data.lodging.price_per_night != null && (
                    <span> · ${data.lodging.price_per_night}/night</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button
              className="btn-primary"
              onClick={() => window.open('/share/' + trip.id, '_blank')}
            >
              Share the Trip
            </button>
            <button
              className="btn-ghost"
              onClick={copyToClipboard}
              style={{ minWidth: 160 }}
            >
              {copied ? '✓ Link Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Booking links */}
          {data.rounds && data.rounds.some(r => r.website) && (
            <div style={{ marginTop: 28, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
                Booking Links
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.rounds.filter(r => r.website).map((r, i) => (
                  <a
                    key={i}
                    href={r.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-green)',
                      fontSize: 14,
                      textDecoration: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid #1f3b1f',
                    }}
                  >
                    <span>Round {r.round_number}: {r.course_name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>Book →</span>
                  </a>
                ))}
                {data.lodging?.booking_link && (
                  <a
                    href={data.lodging.booking_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-green)',
                      fontSize: 14,
                      textDecoration: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                    }}
                  >
                    <span>{data.lodging.name}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>Book →</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
