# Crew Review Fixes Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement all "fix now", "fix later", and "nice to have" items from the 6-persona crew review of v0.6.0, excluding N6 (nudge notifications), L7 (calendar context), and P2 (bulk nudge).

**Architecture:** 9 sequential tasks — backend first (Tasks 1–2), then frontend in logical groups. Each task is file-isolated. Backend uses pytest; frontend verified via dev server.

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL (backend), React 18 + Zustand + Vite (frontend), inline CSS.

---

## Interface Contracts (agreed before implementation)

### N2 — lodging_skipped
- `Trip.lodging_skipped: Column(Boolean, default=False)` — new column on trips table
- `TripOut.lodging_skipped: bool = False` — in schema
- `PATCH /trips/{trip_id}/lodging-skipped` body `{"skipped": bool}` → `{"ok": true}`
- `LodgingVoting.jsx`: "Skip / Find My Own" calls API, reads `trip.lodging_skipped` from store on mount to restore state
- `LockInPhase.jsx` + `PlanningPhase.jsx`: `lodgingDone = lodging_locked || trip.lodging_skipped`

### L8 — current_phase in TripOut
- `TripOut.current_phase: Optional[str] = None` — open phase name ("availability", "destination", "planning", "locked_in") or "finalized" if trip.status == finalized
- `TripOut.user_action_pending: bool = False` — True if user should take action: availability not submitted in Phase 1; always True in Phase 2/3 if phase is open
- Computed in `list_trips` and `get_trip` with per-trip queries

### P5 — multi-lodging
- `LodgingOption.is_locked: Column(Boolean, default=False)` — new column
- Lock endpoint sets `option.is_locked = True`; also updates `trip.locked_lodging_option_id` to first locked option for backward compat
- Unlock endpoint sets `option.is_locked = False`; clears `trip.locked_lodging_option_id` if it was pointing to that option
- Lodging out schema: `is_locked: bool` per option
- `lodging_locked = any(o.is_locked for o in options)` — at least one locked = done
- HypeMoment shows all `is_locked=True` options in "Where We're Staying"
- CostBreakdown: sums `price_per_night` across all locked options, divides by group size

---

## Task 1 — Backend: N1 (unlock fix), N2 (lodging_skipped), N7 (DATABASE_URL assert)

**Files:**
- Modify: `backend/models/trip.py` — add `lodging_skipped` column
- Modify: `backend/schemas/trip.py` — add `lodging_skipped` to TripOut
- Modify: `backend/api/trips.py` — fix unlock_trip, add lodging-skipped endpoint
- Modify: `backend/main.py` — DATABASE_URL startup assertion
- Modify: `backend/tests/test_trips.py` or create `backend/tests/test_unlock.py`

### N1 — Fix unlock_trip
Current: sets `trip.status = planning`, reopens only `locked_in` phase. After finalize all 4 phases are locked, so no phase ends up open → organizer is stuck or confused.

Fix: reopen `planning` phase and set `locked_in` back to `pending`:
```python
# After setting trip.status = TripStatus.planning:
planning_phase = db.query(TripPhase).filter(TripPhase.trip_id == trip_id, TripPhase.phase == PhaseName.planning).first()
if planning_phase:
    planning_phase.status = PhaseStatus.open
locked_in_phase = db.query(TripPhase).filter(TripPhase.trip_id == trip_id, TripPhase.phase == PhaseName.locked_in).first()
if locked_in_phase:
    locked_in_phase.status = PhaseStatus.pending
```

### N2 — Add lodging_skipped
Model (`backend/models/trip.py`):
```python
lodging_skipped = Column(Boolean, nullable=False, default=False, server_default='false')
```

Schema (`backend/schemas/trip.py`):
```python
class TripOut(BaseModel):
    ...
    lodging_skipped: bool = False
```

Endpoint (`backend/api/trips.py`):
```python
class _LodgingSkippedBody(BaseModel):
    skipped: bool

@router.patch("/{trip_id}/lodging-skipped")
def set_lodging_skipped(trip_id, body, db, user):
    trip = _get_trip_for_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(403, "Only the organizer can skip lodging")
    trip.lodging_skipped = body.skipped
    db.commit()
    return {"ok": True}
```

### N7 — DATABASE_URL startup assertion
In `backend/main.py` lifespan, after SECRET_KEY check:
```python
if not os.getenv("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL environment variable is required.")
```

### Tests
Write 2 tests:
1. `test_unlock_reopens_planning_phase` — finalize a trip, call unlock, assert planning phase is open
2. `test_set_lodging_skipped` — call PATCH lodging-skipped, assert trip.lodging_skipped = True

Run: `cd backend && .venv/Scripts/python.exe -m pytest backend/tests/ -v --tb=short 2>&1 | tail -20`
Expected: all pass (currently ~60 passing + 2 new)

Commit: `git commit -m "fix: unlock reopens planning; add lodging_skipped; require DATABASE_URL at startup"`

---

## Task 2 — Backend: TripOut current_phase + user_action_pending (L8 backend)

**Files:**
- Modify: `backend/schemas/trip.py` — add fields to TripOut
- Modify: `backend/api/trips.py` — compute in list_trips and get_trip

### Changes

`TripOut` additions:
```python
current_phase: Optional[str] = None    # open phase name or "finalized"
user_action_pending: bool = False       # user has something to do
```

In `list_trips`, for each trip in the returned list, compute:
- `current_phase`: query TripPhase for this trip, find the one with status=open → return its phase name (as string). If trip.status == "finalized" → "finalized". If none open → None.
- `user_action_pending`: 
  - If `current_phase == "availability"`: check if AvailabilityResponse exists for (trip_id, user.id). If not → True.
  - If `current_phase in ("destination", "planning")`: True (user can always vote)
  - Otherwise: False

To avoid N+1 queries on `list_trips`, batch the phase and availability lookups:
- After `db.query(Trip).filter(...).all()`, collect all trip_ids
- One query: `db.query(TripPhase).filter(TripPhase.trip_id.in_(trip_ids), TripPhase.status == "open").all()` → build dict `{trip_id: phase_name}`
- One query: `db.query(AvailabilityResponse).filter(AvailabilityResponse.trip_id.in_(avail_trip_ids), AvailabilityResponse.user_id == user.id).all()` → build set of responded trip_ids

But `TripOut` is a Pydantic schema with `from_attributes=True`. The ORM objects won't have `current_phase` or `user_action_pending` as attributes. So: don't use `response_model=list[TripOut]` for list_trips, or use `model_validate` manually.

Simplest approach: change `list_trips` to build the response manually:
```python
trips = db.query(Trip).filter(...).all()
# batch phase + availability queries
# build response dicts with extra fields
return [TripOut.model_validate({**trip.__dict__, "current_phase": ..., "user_action_pending": ...}) for trip in trips]
```

Also update `get_trip` the same way for consistency.

**Note:** `AvailabilityResponse` is in `models.availability`. Import it in `api/trips.py`.

### Tests
Write 1 test:
- `test_trip_list_includes_current_phase` — create trip, check list returns current_phase == "availability"

Run full suite. Commit: `git commit -m "feat: add current_phase and user_action_pending to TripOut for dashboard badges"`

---

## Task 3 — Frontend: Quick Wins (N3, N5, L9, L10)

**Files:**
- Modify: `frontend/src/phases/destination/GenerateForm.jsx` — N3
- Modify: `frontend/src/components/MemberPanel.jsx` — N5
- Modify: `frontend/src/pages/TripRoom.jsx` — L9
- Modify: `frontend/src/pages/Dashboard.jsx` — L10

### N3 — GenerateForm planned_rounds default
Change line 28:
```jsx
// Before
const [plannedRoundsStr, setPlannedRoundsStr] = useState('3')
// After
const [plannedRoundsStr, setPlannedRoundsStr] = useState(String(trip?.planned_rounds ?? 3))
```

### N5 — fetchMe after handicap save
MemberPanel.jsx already has `loadTrip = useTripStore(s => s.loadTrip)`. Add fetchMe:
```jsx
const fetchMe = useAuthStore(s => s.fetchMe)
// in saveHandicap after the two patch calls:
loadTrip(trip.id)
fetchMe()  // refreshes user.handicap in auth store
```
`fetchMe` already exists in auth.js (calls GET /auth/me and sets user).

### L9 — Phase label rename
In `TripRoom.jsx` PHASE_LABELS object:
```jsx
destination: 'Destinations',  // was 'AI Destinations'
```

### L10 — Invite button rename
In `Dashboard.jsx` PendingInvites component:
```jsx
{working[inv.trip_id] === 'decline' ? 'Declining...' : 'Decline'}
// Also update: respond(inv.trip_id, 'decline') — keep same, just label changes
```

Commit: `git commit -m "fix: planned rounds default, HCP auth store refresh, Destinations label, Decline button"`

---

## Task 4 — Frontend: Dashboard Phase Badge + Waiting Badge (L8 frontend)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

### Changes

Each trip card in Dashboard.jsx currently shows: name, Finalized badge, member count, dates.

Add two badges below the name/status row:

1. **Phase badge** — show current phase in a small chip:
   - "Phase 1: Availability" (blue/gray tint)
   - "Phase 2: Destinations" (blue/gray tint)
   - "Phase 3: Planning" (blue/gray tint)
   - "Phase 4: Lock It In" (amber tint)
   - "Finalized" (green — already exists, just reuse)
   - Use `trip.current_phase` from the TripOut field added in Task 2
   - Phase → label map: `{ availability: 'Phase 1: Availability', destination: 'Phase 2: Destinations', planning: 'Phase 3: Planning', locked_in: 'Phase 4: Lock It In', finalized: 'Finalized' }`

2. **"Waiting on your response"** badge — amber, shows when `trip.user_action_pending === true`:
   - Text: "⏳ Waiting on you"
   - Style: small amber chip similar to the Finalized badge

Place badges on the second line of the trip card (below the name line, above/beside the member count line).

The `trips` state comes from `client.get('/trips')` which now returns `current_phase` and `user_action_pending` via Task 2.

Commit: `git commit -m "feat: show current phase and waiting badge on dashboard trip cards"`

---

## Task 5 — Frontend: Course Card Enrichment (L4, L5, L6, P3)

**Files:**
- Read first: `backend/services/claude.py` (check what fields are generated for courses)
- Modify: `frontend/src/phases/planning/RoundVoting.jsx` — L4, L5, P3
- Modify: `frontend/src/phases/lockin/HypeMoment.jsx` — L4, L6
- Modify: `frontend/src/phases/destination/DestinationCard.jsx` — L4

### L4 — AI Disclaimer
Add a small disclaimer line to AI-generated course cards and destination cards:
- Text: `AI-estimated · verify fees and links before booking`
- Style: `fontSize: 11, color: 'var(--text-muted)', marginTop: 6`
- Only on AI-generated cards (source === 'ai' for courses; all destination cards)
- On `DestinationCard`: always show (all destinations are AI-generated)
- On `RoundVoting` course cards: show when `nom.source === 'ai'`
- On `HypeMoment` CourseCard: always show (locked courses)

### L5 — Yardage Display (RoundVoting)
First read `backend/services/claude.py` to find exact yardage field names in course_data.
Expected fields: `cd.yardage_championship`, `cd.yardage_member`, `cd.yardage_forward` (or similar).
Add a `DetailRow` for yardage in the course card in RoundVoting.jsx:
```jsx
<DetailRow label="Yardage" value={[
  cd.yardage_championship && `${cd.yardage_championship} (champ)`,
  cd.yardage_member && `${cd.yardage_member} (member)`,
  cd.yardage_forward && `${cd.yardage_forward} (forward)`,
].filter(Boolean).join(' · ')} />
```

### L6 — Rating Source in HypeMoment
The share endpoint (`GET /share/{trip_id}`) builds `rounds` data. Check if `rating_source` is included.
If not, add it to the share API response.
In `HypeMoment.jsx` `CourseCard`, add:
```jsx
<DetailRow label="Rating source" value={round.rating_source} />
```

### P3 — Prestige Badge
Check if `course_data` has a ranking/top100 field (e.g., `cd.ranking`, `cd.top_100`, `cd.prestige`).
If present in the AI-generated data, show a badge:
```jsx
{cd.ranking && (
  <span style={{ fontSize: 11, color: '#cc9900', fontWeight: 700, marginLeft: 6 }}>
    #{cd.ranking}
  </span>
)}
```
If no such field exists in the current prompt output, add it to the course generation prompt in `backend/services/claude.py` (add `"ranking": "e.g. #42 Golf Digest Top 100 Public"` to the JSON schema).

Commit: `git commit -m "feat: AI disclaimer, yardage, rating source, prestige badge on course cards"`

---

## Task 6 — Frontend: Lodging + LockIn Fixes (N2 frontend, L3, L12)

**Files:**
- Modify: `frontend/src/phases/planning/LodgingVoting.jsx` — N2 frontend, L12
- Modify: `frontend/src/phases/lockin/LockInPhase.jsx` — N2 frontend, L3
- Modify: `frontend/src/phases/planning/PlanningPhase.jsx` — N2 frontend (readyToAdvance)
- Add to: `frontend/src/api/trips.js` or `frontend/src/api/lodging.js` — N2 API call

### N2 frontend — Persist lodging skip state
In `LodgingVoting.jsx`:
- On mount, read `trip.lodging_skipped` (now in TripOut from Task 1): `const [skipped, setSkipped] = useState(trip?.lodging_skipped ?? false)`
- When user clicks "Skip / Find My Own", call `client.patch('/trips/${trip.id}/lodging-skipped', {skipped: true})` AND `setSkipped(true)`
- When user clicks "Actually, set up lodging", call `client.patch('/trips/${trip.id}/lodging-skipped', {skipped: false})` AND `setSkipped(false)`
- Also call `onLodgingUpdated?.()` after each to refresh parent state

In `LockInPhase.jsx`:
- Change `const lodgingLocked = lodging != null ? lodging.locked_option_id != null : true` to also account for skipped:
```jsx
const lodgingSkipped = trip?.lodging_skipped ?? false
const lodgingLocked = lodgingSkipped || (lodging != null ? lodging.locked_option_id != null : true)
```
- Update the checklist item for lodging:
```jsx
{lodging != null ? (
  <ChecklistItem label="Lodging" detail={lodgingSkipped ? "Skipped — finding separately" : ...} done={lodgingSkipped || lodging.locked_option_id != null} />
) : lodgingSkipped ? (
  <ChecklistItem label="Lodging" detail="Skipped — finding separately" done={true} />
) : (
  <ChecklistItem label="Lodging" detail="No lodging configured (optional)" done={true} />
)}
```

In `PlanningPhase.jsx`:
- `const lodgingDone = (trip?.lodging_skipped) || lodgingLocked` (replace the existing `lodgingLocked` in `readyToAdvance`)

### L3 — Non-organizer LockIn context
In `LockInPhase.jsx`, the non-organizer sees "Waiting for the organizer to lock the trip." Change this to include more context:
```jsx
) : (
  <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0', borderTop: '1px solid #2a2a2a' }}>
    <div style={{ marginBottom: 8 }}>The checklist above shows the current status — the organizer will lock the trip once everything is ready.</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This page refreshes automatically every 10 seconds.</div>
  </div>
)}
```
The checklist items (dates, destination, rounds, lodging) already show to all users. This just improves the bottom message.

### L12 — Suggest More progress indicator
In `LodgingVoting.jsx`, after clicking "Generate More Options", the `generatingMore` state is true but there's no visual indication of polling. Fix:
- After `handleGenerateMore` completes, set `lodging.generation_status = 'pending'` locally so the existing 5s polling picks up.
- Show "Generating more options..." spinner while `generatingMore` is true.
- The existing `lodging.generation_status === 'pending'` polling effect already handles the rest.

Actually: the lodging already has a `generation_status` field. After calling `generateMoreLodging`, the backend sets `generation_status = pending` on the `LodgingSetup` row. But `loadLodging()` fetches the updated status. The issue: `handleGenerateMore` calls `generateMoreLodging()` then `loadLodging()` — but `loadLodging()` may race with the backend before it's set to pending.

Fix: after `generateMoreLodging()`, manually set `setLodging(prev => ({...prev, generation_status: 'pending'}))` before calling `loadLodging()`. The polling effect then fires every 5s until complete.

Commit: `git commit -m "fix: persist lodging skip, non-organizer lockin context, suggest more progress"`

---

## Task 7 — Frontend: Voting/Flow Fixes (L1, L2, L14, L15)

**Files:**
- Modify: `frontend/src/phases/planning/PlanningPhase.jsx` — L1 (Remove Round confirm)
- Modify: `frontend/src/pages/TripRoom.jsx` — L2 (TodoBanner vote check)
- Modify: `frontend/src/phases/availability/AvailabilityPhase.jsx` — L14 (heatmap refreshKey)
- Modify: `frontend/src/phases/destination/DestinationPhase.jsx` — L15 (regen warning)

### L1 — Remove Round Confirmation
In `PlanningPhase.jsx` `handleRemoveRound`:
```jsx
const handleRemoveRound = async (roundId) => {
  if (!window.confirm('Remove this round? All nominations and votes will be lost.')) return
  setRemovingId(roundId)
  try {
    const updated = await removeRound(trip.id, roundId)
    onRoundsSetup(updated)
  } catch { } finally {
    setRemovingId(null)
  }
}
```

### L2 — TodoBanner clears after voting
In `TripRoom.jsx` `TodoBanner` component, the `destination` and `planning` cases currently set a static todo string. Fix:

For `destination`:
```jsx
} else if (openPhase === 'destination') {
  client.get(`/trips/${trip.id}/destinations`)
    .then(r => {
      const suggestions = r.data.suggestions || []
      const hasVoted = suggestions.some(s => s.vote_tally?.my_vote != null)
      setTodo(hasVoted ? null : 'Vote on the destination options below.')
    })
    .catch(() => setTodo('Vote on the destination options below.'))
```

For `planning`:
```jsx
} else if (openPhase === 'planning') {
  client.get(`/trips/${trip.id}/rounds`)
    .then(r => {
      const rounds = r.data || []
      const hasVotedAll = rounds.length > 0 && rounds.every(r => 
        r.nominations?.some(n => n.vote_tally?.my_vote != null) || r.locked_course_id != null
      )
      setTodo(hasVotedAll ? null : 'Vote on courses and lodging options below.')
    })
    .catch(() => setTodo('Vote on courses and lodging options below.'))
```

These calls fire every time `refreshKey` changes (already in deps via `[openPhase, trip?.id, user?.id, refreshKey]`).

### L14 — AvailabilityPhase heatmap refreshKey
In `AvailabilityPhase.jsx`, the main `useEffect` for fetching availability has `[trip?.id]` deps. Add `refreshKey` so the organizer heatmap refreshes after any member submits:
```jsx
const refreshKey = useTripStore(s => s.refreshKey)
// ...
useEffect(() => {
  if (!trip) return
  getAvailability(trip.id).then(data => {
    setAvailabilityData(data)
    // ...
  }).catch(() => {})
}, [trip?.id, refreshKey])
```

### L15 — Destination Regeneration Warning
In `DestinationPhase.jsx`, find the "Regenerate" button handler. Before calling the generate function, check if manual nominations exist:
```jsx
const handleRegenerate = async () => {
  const manualCount = (data?.suggestions || []).filter(s => s.source === 'manual').length
  if (manualCount > 0) {
    if (!window.confirm(`Regenerating will remove your ${manualCount} manually added destination${manualCount > 1 ? 's' : ''}. Continue?`)) return
  }
  // proceed with generation
}
```

Commit: `git commit -m "fix: remove round confirm, todoBanner clears after voting, heatmap refreshKey, regen warning"`

---

## Task 8 — Frontend: Form + UX Polish (L11, P1, P4, P6, P7, P8)

**Files:**
- Modify: `frontend/src/phases/planning/LodgingVoting.jsx` — L11 (ManualLodgingForm mobile)
- Modify: `frontend/src/phases/planning/RoundVoting.jsx` — L11 (manual course form mobile)
- Modify: `frontend/src/phases/lockin/HypeMoment.jsx` — P1 (celebration), P4 (tee time), P8 (booking links)
- Modify: `frontend/src/phases/destination/GenerateForm.jsx` — P7 (field order)
- Modify: `frontend/src/components/MemberPanel.jsx` — P6 (HCP aggregate)

### L11 — Manual Form Mobile Overflow
`ManualLodgingForm` in LodgingVoting.jsx uses fixed-pixel-width inputs in a wrapping flex. Replace with a responsive grid:
- Change `display: 'flex', flexWrap: 'wrap'` to `display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'`
- Remove all `width: NNN` from individual field wrappers — let grid handle sizing
- Each field wrapper: `<div>` with label+input, no explicit width

Same pattern for the manual course nomination form in `RoundVoting.jsx`.

### P1 — HypeMoment Celebration Banner
At the top of HypeMoment (before the trip name section), add:
```jsx
<div style={{
  background: 'linear-gradient(135deg, #1a2a1a, #0d1f0d)',
  border: '1px solid var(--accent-green)',
  borderRadius: 10, padding: '14px 20px',
  marginBottom: 24, textAlign: 'center',
}}>
  <div style={{ fontSize: 22, marginBottom: 4 }}>🏌️ The trip is on!</div>
  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
    Everything is locked. Time to pack your clubs.
  </div>
</div>
```

### P4 — Tee Time Normalization
In `HypeMoment.jsx` `RoundScheduleEditor`, change tee time inputs from `type="text"` to `type="time"`:
- `<input type="time" value={t} ...>` — returns HH:MM in 24h
- Add a helper `fmtTeeTime(val)` to display as 12h:
  ```jsx
  function fmtTeeTime(val) {
    if (!val || !val.includes(':')) return val
    const [h, m] = val.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  }
  ```
- Non-organizer view: display `fmtTeeTime(t)` instead of raw value
- Organizer view: `<input type="time">` stores in HH:MM, display reads naturally in browser time picker
- The tee_time string stored in DB becomes comma-separated HH:MM values ("08:30, 10:15") — normalize on save

### P6 — HCP Aggregate in GenerateForm
In `GenerateForm.jsx`, below the autoHcp display line, add:
```jsx
{useProfileHcp && autoHcp && (() => {
  const joined = (trip?.members || []).filter(m => m.joined === 'joined' && m.handicap != null)
  if (joined.length < 2) return null
  const hcps = joined.map(m => m.handicap)
  const avg = (hcps.reduce((s,h) => s+h, 0) / hcps.length).toFixed(1)
  const min = Math.min(...hcps)
  const max = Math.max(...hcps)
  return <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
    Avg {avg} · Range {min}–{max}
  </div>
})()}
```

### P7 — GenerateForm Field Order
Reorder the form fields:
1. Country (was 5th)
2. Region (was 6th)
3. Planned Rounds (was 3rd)
4. Budget Tier Filter (was 4th)
5. Group Skill Mix (was 1st)
6. Public courses only (was 2nd)

### P8 — Remove Redundant Booking Links Section
In `HypeMoment.jsx`, the "Booking Links" section at the bottom duplicates links already on each course/lodging card. Remove the entire `Section title="Booking Links"` block. The "Book tee times ↗" link on each CourseCard is sufficient.

Commit: `git commit -m "feat: mobile form grid, celebration banner, tee time picker, HCP aggregate, form reorder, remove dup booking links"`

---

## Task 9 — Backend + Frontend: Multi-Lodging Support (P5)

**Files:**
- Modify: `backend/models/lodging.py` — add `is_locked`
- Modify: `backend/api/lodging.py` — update lock/unlock endpoints
- Modify: `backend/schemas/lodging.py` (or wherever LodgingOptionOut is)
- Modify: `frontend/src/phases/planning/LodgingVoting.jsx` — lock multiple
- Modify: `frontend/src/phases/lockin/HypeMoment.jsx` — show all locked
- Modify: `frontend/src/phases/lockin/LockInPhase.jsx` — CostBreakdown multi-lodging

### Backend changes

`LodgingOption` model:
```python
is_locked = Column(Boolean, nullable=False, default=False, server_default='false')
```

`LodgingOptionOut` schema: add `is_locked: bool = False`

Lock endpoint (currently `POST /trips/{trip_id}/lodging/lock`):
```python
# Set is_locked = True on this option
# Also set trip.locked_lodging_option_id = option_id (for backward compat with first-locked)
# Actually: set it to first locked option after this change
```

Unlock endpoint (currently `DELETE /trips/{trip_id}/lodging/lock`):
```python
# Currently unlocks ALL lodging. Change to: POST /trips/{trip_id}/lodging/{option_id}/lock → lock
#                                           DELETE /trips/{trip_id}/lodging/{option_id}/lock → unlock specific option
# Keep existing endpoints for backward compat but add option_id versions
```

Read `backend/api/lodging.py` first to understand current endpoint shape, then decide on cleanest approach.

The lodging-done check in `LockInPhase.jsx` and the share endpoint should use `any(o.is_locked for o in options)` instead of `locked_option_id`.

### Frontend changes

`LodgingVoting.jsx`:
- Per-option lock button changes from "Lock This Lodging" (locks all) to "Lock as Primary" or "✅ Lock"
- Locked options show "✅ Locked" badge with individual "Unlock" button
- Multiple options can be locked simultaneously
- The locked banner shows count: "✅ 2 lodging options locked."
- Skip/advance is allowed if at least one option is locked

`HypeMoment.jsx`:
- "Where We're Staying" section: shows ALL `is_locked = True` options, not just the one matching `lodging.locked_option_id`
- Each locked option gets its own `LodgingCard`

`LockInPhase.jsx` `CostBreakdown`:
- If multiple lodging options locked, sum their `price_per_night` before dividing by nights/group_size
- Checklist: "Lodging" becomes "Lodging (2 options)" if multiple locked

`LockInPhase.jsx` checklist:
- `lodgingLocked = options.some(o => o.is_locked)` (at least one locked = done)

### Tests
Write 1 test: `test_lock_multiple_lodging_options`

Run full suite. Commit: `git commit -m "feat: allow locking multiple lodging options for split-group trips"`

---

## Verification

After all tasks:
```bash
cd backend && .venv/Scripts/python.exe -m pytest backend/tests/ -v 2>&1 | tail -20
```
Expected: all pass.

Final deployment:
```bash
cd frontend && npm run build
firebase deploy --only hosting
git push
```
