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
  const [lockError, setLockError] = useState(null)
  const [lockStart, setLockStart] = useState('')
  const [lockEnd, setLockEnd] = useState('')
  const [budgetData, setBudgetData] = useState(null)

  useEffect(() => {
    if (!trip) return
    getAvailability(trip.id).then(data => {
      if (data.own_response) {
        setDateRanges(data.own_response.date_ranges)
        setSaved(true)  // already submitted
      }
      if (isOrganizer && data.budget) {
        setBudgetData(data.budget)
      }
    }).catch(() => {})
  }, [trip?.id])

  useEffect(() => {
    if (!trip || !isOrganizer) return
    getAvailability(trip.id).then(data => {
      setBudgetData(data.budget)
    }).catch(() => {})
  }, [trip?.id, isOrganizer])

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
    if (!lockStart || !lockEnd) return
    setLocking(true)
    setLockError(null)
    try {
      await lockPhase('availability', { trip_start: lockStart, trip_end: lockEnd })
    } catch (e) {
      setLockError(e.response?.data?.detail || 'Failed to lock dates. Try again.')
      setLocking(false)
    }
  }

  const handleHeatmapDateClick = (date) => {
    if (!lockStart || (lockStart && lockEnd)) {
      setLockStart(date)
      setLockEnd('')
    } else if (date >= lockStart) {
      setLockEnd(date)
    } else {
      setLockStart(date)
      setLockEnd('')
    }
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
              <DateRangePicker value={dateRanges} onChange={setDateRanges} readOnly={saved} />
              <div style={{ margin: '20px 0' }}>
                <BudgetVoteForm
                  happySpend={budget.happySpend}
                  hardLimit={budget.hardLimit}
                  onChange={setBudget}
                />
              </div>
              {saved && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Availability submitted ✓</span>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setSaved(false)}>
                    Edit
                  </button>
                </div>
              )}
              {!saved && (
                <button type="submit" className="btn-primary" disabled={saving || dateRanges.length === 0}>
                  {saving ? 'Saving...' : 'Submit Availability'}
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Right: organizer view */}
        {isOrganizer && (
          <div style={{ flex: '1 1 320px' }}>
            <div className="card">
              <OverlapHeatmap
                trip={trip}
                budget={budgetData}
                onDateClick={handleHeatmapDateClick}
                responses={isOrganizer ? (availability?.responses ?? []) : null}
                members={trip?.members?.filter(m => m.joined === 'joined') ?? []}
              />
              <div style={{ marginTop: 20, borderTop: '1px solid #333', paddingTop: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Choose the trip dates:</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="date" value={lockStart} onChange={e => setLockStart(e.target.value)} style={{ width: 150 }} />
                    <span style={{ color: 'var(--text-secondary)' }}>to</span>
                    <input type="date" value={lockEnd} onChange={e => setLockEnd(e.target.value)} style={{ width: 150 }} />
                  </div>
                </div>
                <button
                  className="btn-primary"
                  onClick={handleLock}
                  disabled={locking || !lockStart || !lockEnd}
                  style={{ width: '100%' }}
                >
                  {locking ? 'Locking...' : 'Lock These Dates → Phase 2'}
                </button>
                {lockError && (
                  <div style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{lockError}</div>
                )}
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
