import { useState, useEffect } from 'react'
import { setupRounds } from '../../api/rounds'

const TIER_OPTIONS = [
  { value: 'premium', label: 'Premium' },
  { value: 'midrange', label: 'Midrange' },
  { value: 'value', label: 'Value' },
]

function buildDefaultRounds(count) {
  return Array.from({ length: count }, (_, i) => ({
    round_number: i + 1,
    tier: 'midrange',
  }))
}

export default function RoundsSetup({ trip, onSetup }) {
  const [numRounds, setNumRounds] = useState(3)
  const [rounds, setRounds] = useState(buildDefaultRounds(3))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const n = Math.max(1, Math.min(5, numRounds))
    setRounds(prev => {
      if (prev.length === n) return prev
      if (n > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, (_, i) => ({
            round_number: prev.length + i + 1,
            tier: 'midrange',
          })),
        ]
      }
      return prev.slice(0, n).map((r, i) => ({ ...r, round_number: i + 1 }))
    })
  }, [numRounds])

  const setTier = (index, tier) => {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, tier } : r))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await setupRounds(trip.id, rounds)
      onSetup(result)
    } catch (e) {
      setError('Failed to set up rounds. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Set Up Rounds</h3>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          How many rounds?
        </label>
        <input
          type="number"
          min={1}
          max={5}
          value={numRounds}
          onChange={e => setNumRounds(parseInt(e.target.value, 10) || 1)}
          style={{
            width: 80,
            padding: '6px 10px',
            background: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: 6,
            color: '#fff',
            fontSize: 15,
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {rounds.map((round, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 80, fontWeight: 600, fontSize: 13 }}>
              Round {round.round_number}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {TIER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTier(i, opt.value)}
                  className={round.tier === opt.value ? 'btn-primary' : 'btn-ghost'}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ color: '#e55', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={submitting}
        style={{ minWidth: 140 }}
      >
        {submitting ? 'Setting up...' : 'Set Up Rounds'}
      </button>
    </div>
  )
}
