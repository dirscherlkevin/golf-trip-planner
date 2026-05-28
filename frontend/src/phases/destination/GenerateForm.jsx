import { useState } from 'react'
import { generateDestinations } from '../../api/destinations'

const TIER_OPTIONS = [
  { value: 'show_all', label: 'Show All (Recommended)' },
  { value: 'budget', label: 'Budget — under $100/round' },
  { value: 'midrange', label: 'Midrange — $100–200/round' },
  { value: 'luxury', label: 'Luxury — $200+/round' },
]

export default function GenerateForm({ trip, budgetHint, onGenerated }) {
  const [skillMix, setSkillMix] = useState('')
  const [tierFilter, setTierFilter] = useState('show_all')
  const [country, setCountry] = useState('United States')
  const [plannedRounds, setPlannedRounds] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!skillMix.trim()) { setError('Please describe your group\'s skill mix'); return }
    setError('')
    setLoading(true)
    try {
      const result = await generateDestinations(trip.id, {
        skill_mix: skillMix,
        tier_filter: tierFilter,
        country,
        planned_rounds: plannedRounds,
      })
      onGenerated(result)
    } catch (err) {
      setError('Failed to generate suggestions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ color: 'var(--accent-green)', marginBottom: 16, marginTop: 0 }}>
        Generate Destination Suggestions
      </h3>
      {budgetHint && (
        <div style={{ background: '#1a2a1a', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>
          Group budget from Phase 1: <strong>{budgetHint}</strong>
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Group Skill Mix</span>
          <input
            type="text"
            placeholder='e.g. "mostly 15–20 handicap, one scratch player"'
            value={skillMix}
            onChange={e => setSkillMix(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Planned Rounds</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min="1" max="10"
              value={plannedRounds}
              onChange={e => setPlannedRounds(parseInt(e.target.value) || 3)}
              style={{ width: 70 }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>rounds of golf</span>
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Budget Tier Filter</span>
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
            style={{ background: '#1a1a1a', color: 'var(--text-primary)', border: '1px solid #444', borderRadius: 6, padding: '8px 10px' }}>
            {TIER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Country</span>
          <select value={country} onChange={e => setCountry(e.target.value)}
            style={{ background: '#1a1a1a', color: 'var(--text-primary)', border: '1px solid #444', borderRadius: 6, padding: '8px 10px' }}>
            <option value="United States">United States</option>
            <option value="Canada">Canada</option>
            <option value="Scotland">Scotland</option>
            <option value="Ireland">Ireland</option>
            <option value="England">England</option>
            <option value="Spain">Spain</option>
            <option value="Portugal">Portugal</option>
            <option value="Other">Other</option>
          </select>
        </label>
        {error && <div style={{ color: '#e55', fontSize: 13 }}>{error}</div>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Generating... (may take 20–30s)' : 'Generate Suggestions'}
        </button>
      </form>
    </div>
  )
}
