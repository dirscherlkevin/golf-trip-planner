import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth'
import { useTripStore } from '../../store/trip'
import { getRounds, addRound, removeRound, suggestRoundOrder } from '../../api/rounds'
import { getLodging } from '../../api/lodging'
import { getAvailability } from '../../api/availability'
import RoundsSetup from './RoundsSetup'
import RoundVoting from './RoundVoting'

export default function PlanningPhase({ onGoToLodging }) {
  const { trip, lockPhase } = useTripStore()
  const user = useAuthStore(s => s.user)
  const isOrganizer = user?.id === trip?.organizer_id

  const [rounds, setRounds] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [lodgingLocked, setLodgingLocked] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [myBudget, setMyBudget] = useState(null)
  const [lodging, setLodging] = useState(null)
  const [orderAdvice, setOrderAdvice] = useState(null)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [orderError, setOrderError] = useState(null)

  const loadRounds = () => {
    if (!trip) return
    getRounds(trip.id)
      .then(data => { setRounds(data); setLoadError(null) })
      .catch(() => setLoadError('Failed to load rounds.'))
  }

  const checkLodging = () => {
    if (!trip) return
    if (trip.lodging_skipped) { setLodgingLocked(true); return }
    getLodging(trip.id)
      .then(data => {
        setLodging(data)
        setLodgingLocked(!!data.options?.some(o => o.is_locked))
      })
      .catch(err => {
        if (err.response?.status === 404) { setLodging(null); setLodgingLocked(false) }
      })
  }

  useEffect(() => {
    loadRounds()
    checkLodging()
    if (trip?.id) {
      getAvailability(trip.id)
        .then(d => { if (d.own_response) setMyBudget({ happy: d.own_response.happy_spend, hard: d.own_response.hard_limit }) })
        .catch(() => {})
    }
  }, [trip?.id])

  useEffect(() => {
    if (!trip || !rounds) return
    const anyPending = rounds.some(r => r.generation_status === 'pending')
    if (anyPending) {
      const timer = setTimeout(loadRounds, 10000)
      return () => clearTimeout(timer)
    }
  }, [trip?.id, rounds])

  const hasRounds = rounds && rounds.length > 0
  const allRoundsLocked = hasRounds && rounds.every(r => r.locked_course_id !== null)
  const readyToAdvance = isOrganizer && allRoundsLocked && lodgingLocked

  const handleAdvance = async () => {
    setAdvancing(true)
    try { await lockPhase('planning') }
    catch { setAdvancing(false) }
  }

  // Combined budget banner (courses + lodging)
  const lockedCourseTotal = (rounds || []).reduce((sum, r) => {
    if (!r.locked_course_id) return sum
    const nom = r.nominations?.find(n => n.id === r.locked_course_id)
    const cd = nom?.course_data || {}
    return sum + (parseFloat(cd.green_fee) || 0) + (parseFloat(cd.cart_fee) || 0)
  }, 0)
  const hasLockedRounds = (rounds || []).some(r => r.locked_course_id)
  const nights = trip?.trip_start && trip?.trip_end
    ? Math.round((new Date(trip.trip_end + 'T00:00:00') - new Date(trip.trip_start + 'T00:00:00')) / 86400000)
    : null
  const groupSize = (trip?.members?.filter(m => m.joined === 'joined') ?? []).length || 1
  const lockedLodgingOption = lodging?.options?.find(o => o.is_locked)
  const lodgingPerPerson = lockedLodgingOption && nights
    ? ((lockedLodgingOption.option_data?.price_per_night ?? 0) * nights) / groupSize
    : 0
  const runningTotal = lockedCourseTotal + lodgingPerPerson
  const overHard = myBudget?.hard != null && runningTotal > myBudget.hard
  const overHappy = myBudget?.happy != null && !overHard && runningTotal > myBudget.happy

  return (
    <div>
      <h2 style={{ color: 'var(--accent-green)', marginBottom: 4 }}>Courses</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Vote on courses for each round. The organizer locks them in when ready.
      </p>

      {/* Combined budget banner */}
      {myBudget && (myBudget.happy || myBudget.hard) && (
        <div style={{
          background: overHard ? '#2a0a0a' : overHappy ? '#2a1f00' : '#141f14',
          border: `1px solid ${overHard ? '#7a1a1a' : overHappy ? '#6a4a00' : '#2a3a2a'}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Your budget:{' '}
            {myBudget.happy ? <strong style={{ color: 'var(--accent-green)' }}>${myBudget.happy.toLocaleString()} happy</strong> : null}
            {myBudget.happy && myBudget.hard ? ' · ' : ''}
            {myBudget.hard
              ? <strong style={{ color: '#cc9900' }}>${myBudget.hard.toLocaleString()} max</strong>
              : <span style={{ color: 'var(--text-muted)' }}>no hard limit</span>}
          </span>
          {(hasLockedRounds || lockedLodgingOption) && (
            <span style={{ color: overHard ? '#f87171' : overHappy ? '#f6ad55' : 'var(--accent-green)', fontWeight: 600 }}>
              {overHard ? '⚠️ ' : overHappy ? '⚡ ' : '✅ '}
              Running total: ${runningTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {lockedLodgingOption && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}> (incl. lodging)</span>}
              {overHard ? ' — over your hard limit!' : overHappy ? ' — over happy spend' : ''}
            </span>
          )}
        </div>
      )}

      <CoursesSection
        trip={trip}
        rounds={rounds}
        loadError={loadError}
        hasRounds={hasRounds}
        isOrganizer={isOrganizer}
        myBudget={myBudget}
        onRoundsSetup={setRounds}
        onRoundUpdated={loadRounds}
      />

      {/* Round order / mix strategy */}
      {hasRounds && rounds.length >= 2 && (
        <div style={{ marginTop: 20 }}>
          {!orderAdvice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn-ghost" onClick={async () => {
                setLoadingOrder(true); setOrderError(null)
                try { setOrderAdvice(await suggestRoundOrder(trip.id)) }
                catch { setOrderError('Could not get suggestion. Try again.') }
                finally { setLoadingOrder(false) }
              }} disabled={loadingOrder} style={{ fontSize: 12, padding: '4px 12px' }}>
                {loadingOrder ? '✨ Thinking...' : '✨ Suggest round order / mix'}
              </button>
              {orderError && <span style={{ fontSize: 12, color: '#e55' }}>{orderError}</span>}
            </div>
          ) : (
            <div style={{ padding: '14px 16px', background: '#111f11', border: '1px solid #2a3a2a', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>✨ Round Strategy</div>
                <button onClick={() => setOrderAdvice(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
              </div>
              {orderAdvice.order_advice && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Order</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{orderAdvice.order_advice}</div>
                </div>
              )}
              {orderAdvice.mix_advice && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mix</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{orderAdvice.mix_advice}</div>
                </div>
              )}
              {orderAdvice.tip && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #1f2f1f' }}>
                  <div style={{ fontSize: 12, color: 'var(--accent-green)', fontStyle: 'italic' }}>💡 {orderAdvice.tip}</div>
                </div>
              )}
              <button className="btn-ghost" onClick={async () => {
                setLoadingOrder(true); setOrderError(null)
                try { setOrderAdvice(await suggestRoundOrder(trip.id)) }
                catch { setOrderError('Try again.') }
                finally { setLoadingOrder(false) }
              }} disabled={loadingOrder} style={{ fontSize: 11, marginTop: 10, padding: '2px 8px' }}>
                {loadingOrder ? 'Thinking...' : 'Re-ask'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Courses done → nudge to Lodging tab */}
      {isOrganizer && allRoundsLocked && !lodgingLocked && (
        <div style={{ marginTop: 24, padding: '14px 18px', background: '#1a2a1a', borderRadius: 10, border: '1px solid var(--accent-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-green)', marginBottom: 2 }}>Courses locked — next up: Lodging</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Head to the Lodging tab to pick where you're staying.</div>
          </div>
          <button className="btn-primary" onClick={onGoToLodging} style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
            Go to Lodging →
          </button>
        </div>
      )}

      {/* Advance to Lock It In */}
      {isOrganizer && hasRounds && (
        <div style={{ marginTop: 16, padding: '16px 20px', background: readyToAdvance ? '#1a2a1a' : '#141414', borderRadius: 10, border: readyToAdvance ? '1px solid var(--accent-green)' : '1px solid #2a2a2a' }}>
          {readyToAdvance ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent-green)', marginBottom: 4 }}>
                  All set — ready to lock it in!
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  All courses and lodging are locked. Advance to finalize the trip.
                </div>
              </div>
              <button className="btn-primary" onClick={handleAdvance} disabled={advancing} style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
                {advancing ? 'Advancing...' : 'Advance to Lock It In →'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Lock all courses{!lodgingLocked ? ' and lodging (Lodging tab)' : ''} to advance.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CoursesSection({ trip, rounds, loadError, hasRounds, isOrganizer, myBudget, onRoundsSetup, onRoundUpdated }) {
  const [addingRound, setAddingRound] = useState(false)
  const [addTier, setAddTier] = useState('midrange')
  const [removingId, setRemovingId] = useState(null)

  if (!trip) return null

  if (loadError) {
    return (
      <div>
        <div style={{ color: '#e55', marginBottom: 12 }}>{loadError}</div>
        <button className="btn-ghost" onClick={onRoundUpdated} style={{ fontSize: 12 }}>Retry</button>
      </div>
    )
  }

  if (rounds === null) return <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Loading rounds...</div>

  if (!hasRounds) {
    if (isOrganizer) return <RoundsSetup trip={trip} onSetup={onRoundsSetup} />
    return (
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Waiting for the organizer to set up rounds...</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          The organizer is configuring the rounds. This page will update automatically.
        </div>
        <button className="btn-ghost" onClick={onRoundUpdated} style={{ fontSize: 12 }}>Refresh now</button>
      </div>
    )
  }

  const handleAddRound = async () => {
    setAddingRound(true)
    try { const updated = await addRound(trip.id, addTier); onRoundsSetup(updated) }
    catch { } finally { setAddingRound(false) }
  }

  const handleRemoveRound = async (roundId) => {
    if (!window.confirm('Remove this round? All course nominations and votes will be lost.')) return
    setRemovingId(roundId)
    try { const updated = await removeRound(trip.id, roundId); onRoundsSetup(updated) }
    catch { } finally { setRemovingId(null) }
  }

  return (
    <div>
      {rounds.map(round => (
        <RoundVoting
          key={round.id}
          round={round}
          tripId={trip.id}
          isOrganizer={isOrganizer}
          myBudget={myBudget}
          lockedCostSoFar={
            (rounds || [])
              .filter(r => r.id !== round.id && r.locked_course_id)
              .reduce((sum, r) => {
                const nom = r.nominations?.find(n => n.id === r.locked_course_id)
                const cd = nom?.course_data || {}
                return sum + (parseFloat(cd.green_fee) || 0) + (parseFloat(cd.cart_fee) || 0)
              }, 0)
          }
          onUpdated={onRoundUpdated}
          onRemove={round.locked_course_id == null ? () => handleRemoveRound(round.id) : null}
          removing={removingId === round.id}
        />
      ))}
      {isOrganizer && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Add a round:</span>
          {['premium', 'midrange', 'value'].map(t => (
            <button key={t} onClick={() => setAddTier(t)}
              className={addTier === t ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 12, padding: '4px 10px', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
          <button className="btn-ghost" onClick={handleAddRound} disabled={addingRound}
            style={{ fontSize: 12, padding: '4px 12px' }}>
            {addingRound ? 'Adding...' : '+ Add Round'}
          </button>
        </div>
      )}
    </div>
  )
}
