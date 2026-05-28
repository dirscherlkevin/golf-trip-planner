import { useState, useEffect } from 'react'
import client from '../api/client'

export default function CostEstimate({ tripId }) {
  const [estimate, setEstimate] = useState(null)

  useEffect(() => {
    if (!tripId) return
    client.get(`/trips/${tripId}/cost`).then(r => setEstimate(r.data)).catch(() => {})
  }, [tripId])

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

  return (
    <div style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
      {sameRange
        ? fmt(estimate.total_low)
        : `~${fmt(estimate.total_low)}–${fmt(estimate.total_high)}`}/person
      {estimate.is_estimate && (
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (est.)</span>
      )}
    </div>
  )
}
