import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import { submitAvailability, getAvailability } from '../../api/availability'
import DateRangePicker from './DateRangePicker'
import BudgetVoteForm from './BudgetVoteForm'
import OverlapHeatmap from './OverlapHeatmap'

export default function AvailabilityPhase() {
  const { trip, lockPhase } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [dateRanges, setDateRanges] = useState([])
  const [budget, setBudget] = useState({ happySpend: '', hardLimit: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [locking, setLocking] = useState(false)

  useEffect(() => {
    if (!trip) return
    getAvailability(trip.id).then(data => {
      if (data.own_response) {
        setDateRanges(data.own_response.date_ranges)
      }
    }).catch(() => {})
  }, [trip?.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (dateRanges.length === 0) return
    setSaving(true)
    setSaved(false)
    try {
      await submitAvailability(trip.id, dateRanges, budget.happySpend || null, budget.hardLimit || null)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleLock = async () => {
    setLocking(true)
    try { await lockPhase('availability') }
    finally { setLocking(false) }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Phase 1: Availability</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        Tell us when you can go. The organizer will lock the best dates once enough people respond.
      </p>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Left: member input */}
        <div style={{ flex: '1 1 320px' }}>
          <div className="card">
            <form onSubmit={handleSubmit}>
              <DateRangePicker value={dateRanges} onChange={setDateRanges} />
              <div style={{ margin: '20px 0' }}>
                <BudgetVoteForm
                  happySpend={budget.happySpend}
                  hardLimit={budget.hardLimit}
                  onChange={setBudget}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="submit" className="btn-primary" disabled={saving || dateRanges.length === 0}>
                  {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Submit Availability'}
                </button>
                {saved && <span style={{ color: 'var(--accent-green)', fontSize: 13 }}>Submitted!</span>}
              </div>
            </form>
          </div>
        </div>

        {/* Right: organizer view */}
        {isOrganizer && (
          <div style={{ flex: '1 1 320px' }}>
            <div className="card">
              <OverlapHeatmap trip={trip} />
              <div style={{ marginTop: 20, borderTop: '1px solid #333', paddingTop: 16 }}>
                <button
                  className="btn-primary"
                  onClick={handleLock}
                  disabled={locking}
                  style={{ width: '100%' }}
                >
                  {locking ? 'Locking...' : 'Lock These Dates → Phase 2'}
                </button>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>
                  You don't need 100% response — use your judgment.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
