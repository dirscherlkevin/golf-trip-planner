import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

export default function MemberPanel({ trip }) {
  const user = useAuthStore(s => s.user)
  const [availability, setAvailability] = useState(null)
  const [nudging, setNudging] = useState(false)

  useEffect(() => {
    if (!trip) return
    client.get(`/trips/${trip.id}/availability`)
      .then(r => setAvailability(r.data))
      .catch(() => {})
  }, [trip?.id])

  const respondedIds = new Set(
    (availability?.responses ?? []).map(r => r.user_id)
      .concat(availability?.own_response ? [availability.own_response.user_id] : [])
  )

  const nudge = async () => {
    setNudging(true)
    try { await client.post(`/trips/${trip.id}/nudge`) } finally { setNudging(false) }
  }

  const isOrganizer = user?.id === trip?.organizer_id
  const members = trip?.members?.filter(m => m.joined === 'joined') ?? []

  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        WHO'S IN ({members.length})
      </div>
      {members.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13 }}>
          <span>{respondedIds.has(m.user_id) ? '✅' : '⏳'}</span>
          <span>{m.invite_email ?? `Member ${m.user_id}`}</span>
        </div>
      ))}
      {isOrganizer && (
        <button
          onClick={nudge}
          disabled={nudging}
          style={{ marginTop: 12, fontSize: 12, padding: '4px 10px' }}
          className="btn-ghost"
        >
          {nudging ? 'Sending...' : 'Nudge non-responders'}
        </button>
      )}
    </div>
  )
}
