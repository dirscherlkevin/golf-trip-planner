import { useState, useEffect } from 'react'
import client from '../api/client'

export default function CostEstimate({ tripId, trip, isOrganizer, refreshKey }) {
  const [estimate, setEstimate] = useState(null)

  useEffect(() => {
    if (!tripId) return
    client.get(`/trips/${tripId}/cost`).then(r => setEstimate(r.data)).catch(() => {})
  }, [tripId, refreshKey])

  if (!estimate) {
    return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Cost estimate loading...</div>
  }

  const fmt = (n) => `$${Math.round(n).toLocaleString()}`

  if (estimate.round_count === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Cost estimate available after rounds are set up
      </div>
    )
  }

  if (estimate.total_low === 0 && estimate.total_high === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Cost estimate available after Phase 2
      </div>
    )
  }

  const sameRange = estimate.total_low === estimate.total_high
  const costDisplay = sameRange
    ? fmt(estimate.total_low)
    : `~${fmt(estimate.total_low)}–${fmt(estimate.total_high)}`

  // Budget warning logic (organizer only)
  const happyBudget = trip?.budget_happy_spend
  const hardBudget = trip?.budget_hard_limit
  const compareCost = estimate.total_high || estimate.total_low

  let warning = null
  if (isOrganizer && compareCost > 0) {
    if (hardBudget && compareCost >= hardBudget) {
      warning = { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', text: `🔴 Over lowest member's hard limit (${fmt(hardBudget)}/person)` }
    } else if (happyBudget && compareCost >= happyBudget) {
      warning = { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', text: `⚠️ Over avg happy spend (${fmt(happyBudget)}/person)` }
    } else if (happyBudget && compareCost >= happyBudget * 0.9) {
      warning = { color: '#fbbf24', bg: 'rgba(251,191,36,0.05)', border: 'rgba(251,191,36,0.2)', text: `⚠️ Near avg happy spend (${fmt(happyBudget)}/person)` }
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
        {costDisplay}/person
        {estimate.is_estimate && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (est.)</span>
        )}
      </div>
      {warning && (
        <div style={{ marginTop: 4, padding: '4px 8px', background: warning.bg, border: `1px solid ${warning.border}`, borderRadius: 5, fontSize: 11, color: warning.color }}>
          {warning.text}
          {hardBudget && compareCost >= hardBudget * 0.9 && compareCost < hardBudget && (
            <span style={{ marginLeft: 4 }}>· Hard limit: {fmt(hardBudget)}</span>
          )}
        </div>
      )}
      {isOrganizer && (happyBudget || hardBudget) && !warning && (
        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
          {happyBudget && `Target (avg): ${fmt(happyBudget)}`}{happyBudget && hardBudget && ' · '}{hardBudget && `Limit (min): ${fmt(hardBudget)}`}
        </div>
      )}
    </div>
  )
}
