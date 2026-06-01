# Golf Trip Planner — Fix-Now Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 "fix now" items from the multi-persona crew review: 2 security issues, 6 mobile layout issues, 2 organizer/heatmap issues, 4 first-time user clarity items, 1 treasurer cost total, and 2 UX quick-wins.

**Architecture:** Six file-isolated tasks that can run in parallel. Backend tasks have pytest tests; frontend tasks are verified by running `npm run dev` and testing manually. No new components or files except one test file. All changes modify existing files only.

**Tech Stack:** Backend: Python 3.11, FastAPI, SQLAlchemy, pytest. Frontend: React 18, Zustand, inline CSS. Auth: python-jose JWT.

**Pre-flight note:** The following items from the original list were already implemented and do NOT need changes: P1 (cold-start screen in App.jsx), F2 (calendar color legend in DateRangePicker), F3 (budget field labels in BudgetVoteForm), U2 (action banner above tabs in TripRoom), G3 (budget aggregate in OverlapHeatmap), U4 (lock confirm flow in DestinationCard + RoundVoting).

---

## File Map

| Task | Files Modified | Items |
|---|---|---|
| 1 | `backend/services/auth.py`, `backend/main.py`, `backend/tests/conftest.py`, `backend/api/users.py`, `backend/tests/test_security.py` (new) | S1, S4 |
| 2 | `backend/schemas/availability.py`, `backend/api/availability.py`, `backend/tests/test_availability.py`, `frontend/src/phases/availability/OverlapHeatmap.jsx`, `frontend/src/phases/availability/AvailabilityPhase.jsx` | G2, M5, F6 (phase 1 of 2) |
| 3 | `frontend/src/pages/Dashboard.jsx` | U5 |
| 4 | `frontend/src/pages/TripRoom.jsx`, `frontend/src/components/MemberPanel.jsx` | U7, F5, M3, M1, M4, F6 (phase 2 of 2), M7 |
| 5 | `frontend/src/phases/availability/DateRangePicker.jsx` | M2, M7 |
| 6 | `frontend/src/phases/lockin/LockInPhase.jsx` | TR1 |

All 6 tasks are file-independent and can execute in parallel.

---

## Task 1 — Backend: JWT secret hardening + user search scope (S1, S4)

**Files:**
- Modify: `backend/services/auth.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/api/users.py`
- Create: `backend/tests/test_security.py`

### S1 — Remove hardcoded JWT secret fallback

- [ ] **Step 1.1: Ensure tests always have SECRET_KEY set**

  In `backend/tests/conftest.py`, add after `load_dotenv()` (after line 8):

  ```python
  os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-deploy")
  ```

  Full updated top of conftest.py:
  ```python
  import pytest
  import os
  from fastapi.testclient import TestClient
  from sqlalchemy import create_engine
  from sqlalchemy.orm import sessionmaker
  from dotenv import load_dotenv

  load_dotenv()
  os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-deploy")

  from main import app
  # ... rest unchanged
  ```

- [ ] **Step 1.2: Remove the hardcoded fallback from auth.py**

  In `backend/services/auth.py`, change line 9:
  ```python
  # Before
  SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

  # After
  SECRET_KEY = os.getenv("SECRET_KEY")
  ```

- [ ] **Step 1.3: Add startup assertion in main.py lifespan**

  In `backend/main.py`, change the lifespan function (lines 18-20):
  ```python
  # Before
  @asynccontextmanager
  async def lifespan(app):
      yield  # email worker disabled — no SMTP configured

  # After
  @asynccontextmanager
  async def lifespan(app):
      if not os.getenv("SECRET_KEY"):
          raise RuntimeError(
              "SECRET_KEY environment variable is required. "
              "Set it in your .env file before starting the server."
          )
      yield  # email worker disabled — no SMTP configured
  ```

- [ ] **Step 1.4: Run existing tests to confirm no regressions**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/ -v --tb=short 2>&1 | tail -20
  ```
  Expected: all 55 tests pass.

### S4 — Scope user search to shared-trip users only

- [ ] **Step 1.5: Write failing tests for S4**

  Create `backend/tests/test_security.py`:
  ```python
  import pytest


  def _register(client, email, name, password="testpass123"):
      r = client.post("/auth/register", json={"email": email, "name": name, "password": password})
      assert r.status_code == 200, r.text
      return r.json()["access_token"]


  def test_search_returns_empty_for_strangers(client):
      """Users not sharing any trip must not appear in search results."""
      token_alice = _register(client, "alice@test.com", "Alice")
      _register(client, "bob@test.com", "Bob")

      r = client.get("/users/search?q=bob", headers={"Authorization": f"Bearer {token_alice}"})
      assert r.status_code == 200
      assert r.json() == []


  def test_search_finds_shared_trip_members(client):
      """Users who joined the same trip as the caller appear in search results."""
      token_carol = _register(client, "carol@test.com", "Carol")
      token_dave = _register(client, "dave@test.com", "Dave")

      trip = client.post(
          "/trips", json={"name": "Scottsdale"},
          headers={"Authorization": f"Bearer {token_carol}"},
      ).json()
      client.post(
          f"/trips/{trip['id']}/invite", json={"email": "dave@test.com"},
          headers={"Authorization": f"Bearer {token_carol}"},
      )
      client.post(f"/trips/{trip['id']}/join", headers={"Authorization": f"Bearer {token_dave}"})

      r = client.get("/users/search?q=dave", headers={"Authorization": f"Bearer {token_carol}"})
      assert r.status_code == 200
      emails = [u["email"] for u in r.json()]
      assert "dave@test.com" in emails


  def test_search_excludes_users_from_unrelated_trips(client):
      """A user in a different trip does not appear in search results."""
      token_eve = _register(client, "eve@test.com", "Eve")
      token_frank = _register(client, "frank@test.com", "Frank")
      _register(client, "grace@test.com", "Grace")

      trip_a = client.post(
          "/trips", json={"name": "Trip A"},
          headers={"Authorization": f"Bearer {token_eve}"},
      ).json()
      client.post(
          f"/trips/{trip_a['id']}/invite", json={"email": "frank@test.com"},
          headers={"Authorization": f"Bearer {token_eve}"},
      )
      client.post(f"/trips/{trip_a['id']}/join", headers={"Authorization": f"Bearer {token_frank}"})

      # Grace is registered but shares no trip with Eve
      r = client.get("/users/search?q=grace", headers={"Authorization": f"Bearer {token_eve}"})
      assert r.status_code == 200
      emails = [u["email"] for u in r.json()]
      assert "grace@test.com" not in emails
  ```

- [ ] **Step 1.6: Run to confirm tests fail**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/test_security.py -v
  ```
  Expected: 2 FAILED (search currently returns all users).

- [ ] **Step 1.7: Replace users.py with scoped implementation**

  Full replacement of `backend/api/users.py`:
  ```python
  from fastapi import APIRouter, Depends, Query
  from sqlalchemy.orm import Session
  from sqlalchemy import select
  from database import get_db
  from models.user import User
  from models.trip import TripMember
  from api.auth import get_current_user

  router = APIRouter()

  @router.get("/search")
  def search_users(
      q: str = Query(..., min_length=2),
      db: Session = Depends(get_db),
      user: User = Depends(get_current_user),
  ):
      """Search users who share at least one trip with the caller."""
      caller_trip_ids = (
          db.query(TripMember.trip_id)
          .filter(TripMember.user_id == user.id, TripMember.joined == "joined")
          .subquery()
      )
      shared_user_ids = (
          db.query(TripMember.user_id)
          .filter(
              TripMember.trip_id.in_(select(caller_trip_ids)),
              TripMember.user_id != user.id,
              TripMember.joined == "joined",
          )
          .distinct()
          .subquery()
      )
      results = (
          db.query(User)
          .filter(
              (User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%")),
              User.id.in_(select(shared_user_ids)),
          )
          .limit(8)
          .all()
      )
      return [{"id": u.id, "email": u.email, "name": u.name} for u in results]
  ```

- [ ] **Step 1.8: Run security tests — expect 3 passed**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/test_security.py -v
  ```
  Expected: 3 PASSED.

- [ ] **Step 1.9: Run full suite — expect no regressions**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/ -v --tb=short 2>&1 | tail -10
  ```
  Expected: 58 passed (55 + 3 new).

- [ ] **Step 1.10: Commit**
  ```bash
  git add backend/services/auth.py backend/main.py backend/tests/conftest.py backend/api/users.py backend/tests/test_security.py
  git commit -m "security: require SECRET_KEY at startup; scope user search to shared trips"
  ```

---

## Task 2 — Heatmap responded count + AvailabilityPhase bug fix + date picker stack (G2, M5, F6 part 1)

**Files:**
- Modify: `backend/schemas/availability.py`
- Modify: `backend/api/availability.py`
- Modify: `backend/tests/test_availability.py`
- Modify: `frontend/src/phases/availability/OverlapHeatmap.jsx`
- Modify: `frontend/src/phases/availability/AvailabilityPhase.jsx`

### G2 backend — add `responded_count` to overlap response

- [ ] **Step 2.1: Write failing backend test**

  Append to `backend/tests/test_availability.py`:
  ```python
  def test_overlap_includes_responded_count(client):
      """overlap endpoint returns how many members have responded vs. total."""
      r1 = client.post("/auth/register", json={"email": "rc1@test.com", "name": "RC1", "password": "p"})
      r2 = client.post("/auth/register", json={"email": "rc2@test.com", "name": "RC2", "password": "p"})
      token1, token2 = r1.json()["access_token"], r2.json()["access_token"]

      trip = client.post("/trips", json={"name": "T"}, headers={"Authorization": f"Bearer {token1}"}).json()
      client.post(f"/trips/{trip['id']}/invite", json={"email": "rc2@test.com"}, headers={"Authorization": f"Bearer {token1}"})
      client.post(f"/trips/{trip['id']}/join", headers={"Authorization": f"Bearer {token2}"})

      # Only rc1 submits availability
      client.post(
          f"/trips/{trip['id']}/availability",
          json={"date_ranges": [{"start": "2025-07-01", "end": "2025-07-05", "type": "available"}]},
          headers={"Authorization": f"Bearer {token1}"},
      )

      r = client.get(f"/trips/{trip['id']}/availability/overlap", headers={"Authorization": f"Bearer {token1}"})
      assert r.status_code == 200
      data = r.json()
      assert "responded_count" in data
      assert data["responded_count"] == 1
      assert data["total_members"] == 2
  ```

- [ ] **Step 2.2: Run to confirm it fails**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/test_availability.py::test_overlap_includes_responded_count -v
  ```
  Expected: FAIL — `responded_count` key missing.

- [ ] **Step 2.3: Add `responded_count` to OverlapOut schema**

  In `backend/schemas/availability.py`, change the `OverlapOut` class (lines 46-48):
  ```python
  # Before
  class OverlapOut(BaseModel):
      days: list[OverlapDay]
      total_members: int

  # After
  class OverlapOut(BaseModel):
      days: list[OverlapDay]
      total_members: int
      responded_count: int = 0
  ```

- [ ] **Step 2.4: Pass responded_count from get_overlap endpoint**

  In `backend/api/availability.py`, change the last two lines of `get_overlap` (lines 134-135):
  ```python
  # Before
  days = [OverlapDay(date=str(d), count=c, pref_count=pref_counts[d]) for d, c in sorted(counts.items())]
  return OverlapOut(days=days, total_members=total_members)

  # After
  days = [OverlapDay(date=str(d), count=c, pref_count=pref_counts[d]) for d, c in sorted(counts.items())]
  return OverlapOut(days=days, total_members=total_members, responded_count=len(responses))
  ```

- [ ] **Step 2.5: Run availability tests — expect all pass**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/test_availability.py -v --tb=short 2>&1 | tail -10
  ```
  Expected: all pass including the new test.

### G2 frontend — show responded count in heatmap header

- [ ] **Step 2.6: Update OverlapHeatmap.jsx header**

  In `frontend/src/phases/availability/OverlapHeatmap.jsx`, replace lines 117-122:
  ```jsx
  // Before
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
    <span style={{ fontWeight: 600 }}>Availability Overlap</span>
    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      {overlap.days.filter(d => d.count > 0).length > 0 ? `${total} members` : 'No responses yet'}
    </span>
  </div>

  // After
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
    <span style={{ fontWeight: 600 }}>Availability Overlap</span>
    <span style={{
      fontSize: 12,
      color: overlap.responded_count > 0 && overlap.responded_count < total
        ? '#fbbf24'
        : 'var(--text-secondary)',
    }}>
      {overlap.responded_count > 0
        ? `${overlap.responded_count} of ${total} responded`
        : 'No responses yet'}
    </span>
  </div>
  ```
  The amber color fires when response is partial (some but not all), so the organizer knows the heatmap is incomplete data.

### G2 bug + F6 part 1 — fix AvailabilityPhase

`AvailabilityPhase.jsx` currently references `availability?.responses` (line 128) but `availability` is never defined — the state variable is missing. Also, after a member submits availability, MemberPanel shows stale ⏳ status until a manual refresh. Fix both here.

- [ ] **Step 2.7: Fix AvailabilityPhase.jsx**

  Full updated `frontend/src/phases/availability/AvailabilityPhase.jsx`:
  ```jsx
  import { useState, useEffect } from 'react'
  import { useAuthStore } from '../../store/auth'
  import { useTripStore } from '../../store/trip'
  import { submitAvailability, getAvailability } from '../../api/availability'
  import DateRangePicker from './DateRangePicker'
  import BudgetVoteForm from './BudgetVoteForm'
  import OverlapHeatmap from './OverlapHeatmap'

  export default function AvailabilityPhase() {
    const { trip, lockPhase, loadTrip } = useTripStore()
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
    const [availabilityData, setAvailabilityData] = useState(null)

    useEffect(() => {
      if (!trip) return
      getAvailability(trip.id).then(data => {
        setAvailabilityData(data)
        if (data.own_response) {
          setDateRanges(data.own_response.date_ranges)
          setSaved(true)
        }
        if (isOrganizer && data.budget) {
          setBudgetData(data.budget)
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
        loadTrip(trip.id)  // bumps refreshKey so MemberPanel re-fetches and shows ✅
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
                  responses={availabilityData?.responses ?? []}
                  members={trip?.members?.filter(m => m.joined === 'joined') ?? []}
                />
                <div style={{ marginTop: 20, borderTop: '1px solid #333', paddingTop: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Choose the trip dates:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="date" value={lockStart} onChange={e => setLockStart(e.target.value)} style={{ width: '100%' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>to</span>
                      <input type="date" value={lockEnd} onChange={e => setLockEnd(e.target.value)} style={{ width: '100%' }} />
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
  ```
  Key changes from original: added `availabilityData` state, merged duplicate `useEffect`, fixed `availability?.responses` → `availabilityData?.responses`, added `loadTrip(trip.id)` after submit, stacked date pickers vertically with `width: '100%'`.

- [ ] **Step 2.8: Commit**
  ```bash
  git add backend/schemas/availability.py backend/api/availability.py backend/tests/test_availability.py frontend/src/phases/availability/OverlapHeatmap.jsx frontend/src/phases/availability/AvailabilityPhase.jsx
  git commit -m "fix: heatmap shows X of N responded; fix availability state bug; stack date pickers on mobile"
  ```

---

## Task 3 — Dashboard section order (U5)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

Trip invites currently appear above the user's own trips. Returning users care more about their trips than pending invites. Move `PendingInvites` to the bottom.

- [ ] **Step 3.1: Reorder Dashboard sections**

  In `frontend/src/pages/Dashboard.jsx`, the `return` block currently renders:
  1. Header
  2. `<PendingInvites />`
  3. Create Trip form
  4. Your Trips list

  Change to:
  1. Header (with refresh button bumped from fontSize 13 → 16 for consistency)
  2. Create Trip form
  3. Your Trips list
  4. `<PendingInvites />`

  Replace the entire `return (...)` block in Dashboard with:
  ```jsx
  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 22 }}>⛳ Golf Trip Planner</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.name}</span>
          <button className="btn-ghost" onClick={handleRefresh} disabled={refreshing} style={{ fontSize: 16 }} title="Refresh">
            {refreshing ? '↻' : '↺'}
          </button>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>Sign Out</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="label">Start a New Trip</div>
        <form onSubmit={createTrip} style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Trip name (e.g. Scottsdale 2025)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>Create Trip</button>
        </form>
      </div>

      <div className="label" style={{ marginBottom: 12 }}>Your Trips</div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : trips.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No trips yet — create your first one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => confirmDelete === trip.id ? null : navigate(`/trips/${trip.id}`)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {trip.name}
                  {trip.status === 'finalized' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px',
                      background: 'var(--accent-green)', color: '#000', borderRadius: 10,
                    }}>Finalized</span>
                  )}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  {trip.members.length} member{trip.members.length !== 1 ? 's' : ''}
                  {trip.trip_start && trip.trip_end && (
                    <span> · {fmtDate(trip.trip_start)} – {fmtDate(trip.trip_end)}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                {trip.organizer_id === user?.id && (
                  confirmDelete === trip.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#e55' }}>Delete this trip?</span>
                        <button className="btn-ghost" onClick={(e) => deleteTrip(e, trip.id)} disabled={deleting}
                          style={{ fontSize: 12, padding: '3px 8px', color: '#e55', borderColor: '#e55' }}>
                          {deleting ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button className="btn-ghost" onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                          style={{ fontSize: 12, padding: '3px 8px' }}>Cancel</button>
                      </div>
                      {deleteError && confirmDelete === trip.id && (
                        <div style={{ fontSize: 11, color: '#e55' }}>{deleteError}</div>
                      )}
                    </div>
                  ) : (
                    <button className="btn-ghost" onClick={() => setConfirmDelete(trip.id)}
                      style={{ fontSize: 12, padding: '3px 8px', color: '#888', borderColor: '#444' }}>
                      Delete
                    </button>
                  )
                )}
                {confirmDelete !== trip.id && <span style={{ color: 'var(--text-muted)' }}>→</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <PendingInvites onJoined={handleJoined} />
    </div>
  )
  ```

- [ ] **Step 3.2: Commit**
  ```bash
  git add frontend/src/pages/Dashboard.jsx
  git commit -m "fix: move trip invites below your trips on dashboard"
  ```

---

## Task 4 — TripRoom + MemberPanel mobile + UX fixes (U7, F5, M3, M1, M4, F6 part 2, M7)

**Files:**
- Modify: `frontend/src/pages/TripRoom.jsx`
- Modify: `frontend/src/components/MemberPanel.jsx`

### TripRoom.jsx changes

- [ ] **Step 4.1: Rewrite TripRoom.jsx**

  Full replacement of `frontend/src/pages/TripRoom.jsx`:
  ```jsx
  import { useEffect, useState } from 'react'
  import { useParams, useNavigate } from 'react-router-dom'
  import { useTripStore } from '../store/trip'
  import { useAuthStore } from '../store/auth'
  import client from '../api/client'
  import MemberPanel from '../components/MemberPanel'
  import CostEstimate from '../components/CostEstimate'
  import AvailabilityPhase from '../phases/availability/AvailabilityPhase'
  import DestinationPhase from '../phases/destination/DestinationPhase'
  import PlanningPhase from '../phases/planning/PlanningPhase'
  import LockInPhase from '../phases/lockin/LockInPhase'
  import HypeMoment from '../phases/lockin/HypeMoment'

  function TodoBanner({ phases, user, trip, refreshKey }) {
    const openPhase = phases.find(p => p.status === 'open')?.phase
    const [todo, setTodo] = useState(null)

    useEffect(() => {
      if (!openPhase || !trip?.id || !user?.id) { setTodo(null); return }
      if (openPhase === 'availability') {
        client.get(`/trips/${trip.id}/availability`)
          .then(r => {
            const responded = r.data.responded_user_ids ?? []
            if (!responded.includes(user.id)) {
              setTodo('Submit your availability — the organizer is waiting!')
            } else {
              setTodo(null)
            }
          })
          .catch(() => setTodo(null))
      } else if (openPhase === 'destination') {
        setTodo('Vote on the destination options below.')
      } else if (openPhase === 'planning') {
        setTodo('Vote on courses and lodging options below.')
      } else {
        setTodo(null)
      }
    }, [openPhase, trip?.id, user?.id, refreshKey])

    if (!todo) return null
    return (
      <div style={{
        background: '#1a2a1a', border: '1px solid var(--accent-green)',
        borderRadius: 8, padding: '10px 16px', marginBottom: 16,
        fontSize: 13, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        📋 <strong>Your action needed:</strong> {todo}
      </div>
    )
  }

  const PHASE_COMPONENTS = {
    availability: AvailabilityPhase,
    destination: DestinationPhase,
    planning: PlanningPhase,
    locked_in: LockInPhase,
  }

  const PHASE_LABELS = {
    availability: 'Availability',
    destination: 'AI Destinations',
    planning: 'Courses + Lodging',
    locked_in: 'Lock It In',
  }

  const REOPENABLE = new Set(['availability', 'destination', 'planning'])

  function PhaseGate({ phases, isOrganizer, onReopen, trip, refreshKey }) {
    const openPhase = phases.find(p => p.status === 'open')
    const openIdx = phases.findIndex(p => p.status === 'open')
    const prevLockedPhase = openIdx > 0 ? phases[openIdx - 1] : null

    const [activeTab, setActiveTab] = useState(null)

    useEffect(() => {
      if (openPhase) setActiveTab(openPhase.phase)
    }, [openPhase?.phase])

    const viewPhase = activeTab ?? openPhase?.phase

    return (
      <div>
        {/* Phase tabs — horizontal scroll on narrow screens, M3 fix */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 24,
          overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        }}>
          {phases.map(p => {
            const isOpen = p.status === 'open'
            const isLocked = p.status === 'locked'
            const isPending = p.status === 'pending'
            const isActive = viewPhase === p.phase
            const canReopen = isOrganizer && prevLockedPhase?.phase === p.phase && REOPENABLE.has(p.phase)
            const clickable = !isPending

            return (
              <div key={p.phase} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                flex: '0 0 auto', minWidth: 110,
              }}>
                <button
                  onClick={() => clickable && setActiveTab(p.phase)}
                  title={isPending ? 'Unlocks once the previous phase is completed' : undefined}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: clickable ? 'pointer' : 'default',
                    background: isActive ? (isOpen ? 'var(--accent-green)' : '#2d4a2d') : isLocked ? '#1a2a1a' : '#1a1a1a',
                    color: isActive ? (isOpen ? '#000' : 'var(--accent-green)') : isPending ? 'var(--text-muted)' : 'var(--text-secondary)',
                    border: isActive ? `2px solid ${isOpen ? 'var(--accent-green)' : 'var(--accent-green)'}` : `1px solid ${isLocked ? '#2d4a2d' : '#333'}`,
                  }}
                >
                  {isLocked ? '✓ ' : isPending ? '🔒 ' : ''}{PHASE_LABELS[p.phase]}
                </button>
                {/* F5 — pending tab explanation */}
                {isPending && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Previous phase first
                  </div>
                )}
                {canReopen && (
                  <button
                    onClick={() => onReopen(p.phase)}
                    style={{
                      fontSize: 12, padding: '2px 8px',
                      background: 'transparent', border: '1px solid #555',
                      borderRadius: 4, color: '#aaa', cursor: 'pointer',
                    }}
                  >
                    Reopen
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Locked-phase read-only banner */}
        {viewPhase && phases.find(p => p.phase === viewPhase)?.status === 'locked' && (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', background: '#1a1a1a',
            border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 12px',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            🔒 This phase is locked — you're viewing it in read-only mode.
          </div>
        )}

        {viewPhase ? (
          (() => {
            if (trip?.status === 'finalized') return <HypeMoment key={refreshKey} trip={trip} isOrganizer={isOrganizer} />
            const Component = PHASE_COMPONENTS[viewPhase]
            return Component ? <Component key={refreshKey} /> : null
          })()
        ) : trip?.status === 'finalized' ? (
          <HypeMoment key={refreshKey} trip={trip} isOrganizer={isOrganizer} />
        ) : null}
      </div>
    )
  }

  export default function TripRoom() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { trip, phases, loading, refreshing, refreshKey, error, loadTrip, refreshPhases, reopenPhase } = useTripStore()
    const user = useAuthStore(s => s.user)
    const isOrganizer = user?.id === trip?.organizer_id

    // M1 — responsive MemberPanel
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
    const [showMembers, setShowMembers] = useState(false)
    const memberCount = trip?.members?.filter(m => m.joined === 'joined').length ?? 0

    useEffect(() => {
      const handler = () => setIsMobile(window.innerWidth < 768)
      window.addEventListener('resize', handler)
      return () => window.removeEventListener('resize', handler)
    }, [])

    useEffect(() => {
      loadTrip(id)
    }, [id])

    useEffect(() => {
      if (!trip?.id) return
      const interval = setInterval(() => refreshPhases(), 15000)
      return () => clearInterval(interval)
    }, [trip?.id])

    if (loading && !trip) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
    if (error && !trip) return <div style={{ padding: 40, color: 'red' }}>Error: {error}</div>
    if (!trip) return null

    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <button className="btn-ghost" onClick={() => navigate('/')} style={{ fontSize: 12 }}>
                  ← Back
                </button>
                {/* U7 — icon-only refresh */}
                <button
                  className="btn-ghost"
                  onClick={() => loadTrip(id)}
                  disabled={refreshing}
                  title={refreshing ? 'Refreshing...' : 'Refresh'}
                  style={{ fontSize: 16, opacity: refreshing ? 0.6 : 1, padding: '3px 10px' }}
                >
                  {refreshing ? '↻' : '↺'}
                </button>
                {/* M1 — members chip on mobile */}
                {isMobile && (
                  <button
                    className="btn-ghost"
                    onClick={() => setShowMembers(v => !v)}
                    style={{ fontSize: 12, marginLeft: 'auto' }}
                  >
                    👥 {memberCount} {showMembers ? '▲' : '▼'}
                  </button>
                )}
              </div>
              <h1 style={{ color: 'var(--accent-green)', fontSize: 24, margin: 0 }}>{trip.name}</h1>
              <div style={{ marginTop: 6 }}>
                <CostEstimate tripId={trip.id} />
              </div>
            </div>
            {/* M1 — full panel only on desktop */}
            {!isMobile && <MemberPanel trip={trip} />}
          </div>

          {/* M1 — collapsible panel on mobile */}
          {isMobile && showMembers && (
            <div style={{
              marginTop: 12, padding: '12px 16px',
              background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
            }}>
              <MemberPanel trip={trip} />
            </div>
          )}
        </div>

        {/* Personal to-do banner */}
        <TodoBanner phases={phases} user={user} trip={trip} refreshKey={refreshKey} />

        {/* Phase content */}
        {phases.length > 0 ? (
          <PhaseGate
            phases={phases}
            isOrganizer={isOrganizer}
            trip={trip}
            refreshKey={refreshKey}
            onReopen={async (phase) => {
              try { await reopenPhase(phase) } catch {}
            }}
          />
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Loading phases...</p>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4.2: Commit TripRoom.jsx**
  ```bash
  git add frontend/src/pages/TripRoom.jsx
  git commit -m "fix: TripRoom mobile — responsive MemberPanel, scrollable tabs, icon refresh, pending tab hints"
  ```

### MemberPanel.jsx changes

- [ ] **Step 4.3: Rewrite MemberPanel.jsx**

  Full replacement of `frontend/src/components/MemberPanel.jsx`:
  ```jsx
  import { useState, useEffect, useRef } from 'react'
  import { useAuthStore } from '../store/auth'
  import { useTripStore } from '../store/trip'
  import client from '../api/client'

  function emailToName(email) {
    if (!email) return 'Unknown'
    return email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function fmtNudge(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  export default function MemberPanel({ trip }) {
    const user = useAuthStore(s => s.user)
    const phases = useTripStore(s => s.phases)
    const refreshKey = useTripStore(s => s.refreshKey)  // F6 — re-fetch when refreshKey bumps
    const openPhase = phases.find(p => p.status === 'open')?.phase ?? null
    const [availability, setAvailability] = useState(null)
    const [nudging, setNudging] = useState({})
    const [showInvite, setShowInvite] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteUrl, setInviteUrl] = useState('')
    const [inviting, setInviting] = useState(false)
    const [inviteCopied, setInviteCopied] = useState(false)
    const [inviteError, setInviteError] = useState(null)
    const [pastGolfers, setPastGolfers] = useState([])
    const [searchResults, setSearchResults] = useState([])
    const [searchOpen, setSearchOpen] = useState(false)
    const [editingHandicap, setEditingHandicap] = useState(false)
    const [handicapStr, setHandicapStr] = useState('')
    const searchTimer = useRef(null)

    // F6 — include refreshKey so we re-fetch after the user submits availability
    useEffect(() => {
      if (!trip) return
      client.get(`/trips/${trip.id}/availability`)
        .then(r => setAvailability(r.data))
        .catch(() => {})
    }, [trip?.id, refreshKey])

    const respondedIds = new Set(availability?.responded_user_ids ?? [])
    const isOrganizer = user?.id === trip?.organizer_id
    const members = trip?.members?.filter(m => m.joined === 'joined') ?? []
    const pending = trip?.members?.filter(m => m.joined !== 'joined') ?? []
    const nonResponders = members.filter(m => m.user_id && !respondedIds.has(m.user_id))

    const nudge = async (userId) => {
      setNudging(n => ({ ...n, [userId]: true }))
      try {
        await client.post(`/trips/${trip.id}/nudge/${userId}`)
      } catch { /* ignore */ } finally {
        setNudging(n => { const next = { ...n }; delete next[userId]; return next })
      }
    }

    const saveHandicap = async () => {
      const val = handicapStr.trim() === '' ? null : parseFloat(handicapStr)
      try {
        await client.patch(`/trips/${trip.id}/members/handicap`, { handicap: val })
        setEditingHandicap(false)
      } catch { /* ignore */ }
    }

    const onEmailChange = (val) => {
      setInviteEmail(val)
      setInviteError(null)
      clearTimeout(searchTimer.current)
      if (val.length < 2) { setSearchResults([]); setSearchOpen(false); return }
      searchTimer.current = setTimeout(async () => {
        try {
          const { data } = await client.get(`/users/search?q=${encodeURIComponent(val)}`)
          setSearchResults(data)
          setSearchOpen(data.length > 0)
        } catch { setSearchResults([]) }
      }, 300)
    }

    const selectUser = (email) => {
      setInviteEmail(email)
      setSearchResults([])
      setSearchOpen(false)
    }

    const sendInvite = async (e) => {
      e.preventDefault()
      if (!inviteEmail.trim() || !inviteEmail.includes('@')) return
      setInviting(true)
      setInviteError(null)
      try {
        const { data } = await client.post(`/trips/${trip.id}/invite`, { email: inviteEmail.trim() })
        setInviteUrl(data.invite_url)
        setInviteEmail('')
        setSearchResults([])
        setSearchOpen(false)
      } catch (err) {
        setInviteError(err.response?.data?.detail || 'Invite failed')
      } finally {
        setInviting(false)
      }
    }

    const copyInvite = async () => {
      try {
        await navigator.clipboard.writeText(inviteUrl)
        setInviteCopied(true)
        setTimeout(() => setInviteCopied(false), 2000)
      } catch {}
    }

    return (
      <div style={{ minWidth: 180, maxWidth: 260 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
          WHO'S IN ({members.length})
        </div>

        {members.map(m => {
          const isMe = m.user_id === user?.id
          const responded = respondedIds.has(m.user_id)
          const name = emailToName(m.invite_email)
          const hcp = m.handicap != null ? `HCP ${m.handicap}` : null
          const nudgedAgo = fmtNudge(m.last_nudged_at)

          return (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span title={responded ? 'Responded' : 'Pending'}>{responded ? '✅' : '⏳'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                  {isMe && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> (you)</span>}
                </span>
                {/* M7 — minimum fontSize 12 for HCP label */}
                {hcp && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{hcp}</span>}
              </div>

              {isMe && (
                <div style={{ marginLeft: 20, marginTop: 2 }}>
                  {!editingHandicap ? (
                    <button className="btn-ghost" onClick={() => { setHandicapStr(m.handicap?.toString() ?? ''); setEditingHandicap(true) }}
                      style={{ fontSize: 12, padding: '1px 6px', color: '#888' }}>
                      {m.handicap != null ? `✏️ Edit HCP` : '+ Add HCP'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="number" value={handicapStr} onChange={e => setHandicapStr(e.target.value)}
                        placeholder="e.g. 14.2" step="0.1"
                        style={{ width: 70, fontSize: 12, padding: '2px 6px', background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, color: '#fff' }}
                        autoFocus />
                      <button className="btn-primary" onClick={saveHandicap} style={{ fontSize: 12, padding: '2px 6px' }}>Save</button>
                      <button className="btn-ghost" onClick={() => setEditingHandicap(false)} style={{ fontSize: 12, padding: '2px 4px' }}>✕</button>
                    </div>
                  )}
                </div>
              )}

              {isOrganizer && openPhase === 'availability' && !responded && m.user_id && m.user_id !== user?.id && (
                <div style={{ marginLeft: 20, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="btn-ghost" onClick={() => nudge(m.user_id)} disabled={nudging[m.user_id]}
                    style={{ fontSize: 12, padding: '1px 6px' }}>
                    {nudging[m.user_id] ? '...' : 'Nudge'}
                  </button>
                  {/* M7 — nudge timestamp minimum fontSize 12 */}
                  {nudgedAgo && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>last {nudgedAgo}</span>}
                </div>
              )}
            </div>
          )
        })}

        {pending.length > 0 && (
          <div style={{ marginTop: 4, marginBottom: 4 }}>
            {pending.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>📨</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.invite_email ?? 'Pending'}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {isOrganizer && (
            <button
              onClick={() => {
                if (!showInvite) {
                  client.get(`/trips/${trip.id}/past-golfers`).then(r => setPastGolfers(r.data)).catch(() => {})
                }
                setShowInvite(!showInvite)
                setInviteUrl('')
                setInviteError(null)
              }}
              style={{ fontSize: 12, padding: '4px 10px' }}
              className="btn-ghost"
            >
              {showInvite ? 'Cancel' : '+ Invite'}
            </button>
          )}
        </div>

        {showInvite && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#1a1a1a', borderRadius: 8, border: '1px solid #2a2a2a' }}>
            {pastGolfers.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {/* M7 — past golfers label minimum fontSize 12 */}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Recent golfers:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {pastGolfers.map(email => (
                    <button key={email} type="button" className="btn-ghost" onClick={() => selectUser(email)}
                      style={{ fontSize: 12, padding: '2px 7px' }}>
                      {email}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={sendInvite}>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={inviteEmail} onChange={e => onEmailChange(e.target.value)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                    placeholder="search name or type email..."
                    style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                  <button type="submit" className="btn-primary" disabled={inviting} style={{ fontSize: 12, padding: '5px 10px' }}>
                    {inviting ? '...' : 'Invite'}
                  </button>
                </div>
                {searchOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#242424', border: '1px solid #3a3a3a', borderRadius: 6,
                    marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}>
                    {searchResults.map(u => (
                      <div key={u.id}
                        onPointerDown={(e) => { e.preventDefault(); selectUser(u.email) }}
                        style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #2a2a2a' }}
                        onPointerEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                        onPointerLeave={e => e.currentTarget.style.background = ''}>
                        <span style={{ color: '#fff' }}>{u.name}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* M7 — invite error fontSize 12 */}
              {inviteError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 5 }}>{inviteError}</div>}
            </form>
            {inviteUrl && (
              <div style={{ marginTop: 8 }}>
                {/* M7 — share link label fontSize 12 */}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Share link (for people not yet signed up):
                </div>
                {/* M7 — copy button fontSize 12 */}
                <button onClick={copyInvite} className="btn-ghost" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}>
                  {inviteCopied ? '✓ Copied!' : 'Copy Invite Link'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4.4: Commit MemberPanel.jsx**
  ```bash
  git add frontend/src/components/MemberPanel.jsx
  git commit -m "fix: MemberPanel touch events, font sizes ≥12px, refreshKey for live status update"
  ```

---

## Task 5 — Calendar tap targets (M2, M7 in DateRangePicker)

**Files:**
- Modify: `frontend/src/phases/availability/DateRangePicker.jsx`

- [ ] **Step 5.1: Fix day cell to meet 44×44px tap target minimum**

  In `frontend/src/phases/availability/DateRangePicker.jsx`, change the day cell div (lines 160-178):
  ```jsx
  // Before
  <div
    key={date}
    onClick={() => toggleDay(date)}
    style={{
      textAlign: 'center',
      padding: '8px 0',
      fontSize: 13,
      ...rest
    }}
  >

  // After
  <div
    key={date}
    onClick={() => toggleDay(date)}
    style={{
      minHeight: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      ...rest   // keep all existing style properties; remove padding: '8px 0' (replaced by minHeight)
    }}
  >
  ```

  Full day cell replacement in context (lines 159-180):
  ```jsx
  return (
    <div
      key={date}
      onClick={() => toggleDay(date)}
      style={{
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        cursor: 'pointer',
        borderRadius: 5,
        background: state ? STATE_BG[state] : '#1e1e1e',
        color: state ? '#000' : readOnly ? '#555' : '#fff',
        border: `1px solid ${state ? STATE_BORDER[state] : '#2a2a2a'}`,
        fontWeight: state ? 700 : 400,
        opacity: readOnly && !state ? 0.4 : 1,
        transition: 'background 0.1s',
      }}
    >
      {day}
    </div>
  )
  ```

- [ ] **Step 5.2: Fix DOW header font size (M7)**

  Change the day-of-week header cells (line 151):
  ```jsx
  // Before
  <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', paddingBottom: 4, fontWeight: 600 }}>

  // After
  <div key={d} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', paddingBottom: 4, fontWeight: 600 }}>
  ```

- [ ] **Step 5.3: Commit**
  ```bash
  git add frontend/src/phases/availability/DateRangePicker.jsx
  git commit -m "fix: calendar day tap targets ≥44px, day-of-week font size"
  ```

---

## Task 6 — Lock It In cost breakdown (TR1)

**Files:**
- Modify: `frontend/src/phases/lockin/LockInPhase.jsx`

The Lock It In page shows a checklist but no cost total. Users need a hard per-person breakdown once all rounds and lodging are locked. Add a `CostBreakdown` component that computes the total from the already-fetched `rounds` and `lodging` state.

- [ ] **Step 6.1: Add CostBreakdown to LockInPhase.jsx**

  Insert the following component immediately before `export default function LockInPhase()` (before line 14):
  ```jsx
  function CostBreakdown({ rounds, lodging, trip }) {
    const nights = trip?.trip_start && trip?.trip_end
      ? Math.round((new Date(trip.trip_end + 'T00:00:00') - new Date(trip.trip_start + 'T00:00:00')) / 86400000)
      : 0
    const groupSize = trip?.members?.filter(m => m.joined === 'joined').length ?? 1

    const roundLines = rounds
      .filter(r => r.locked_course_id != null)
      .map(r => {
        const nom = r.nominations?.find(n => n.id === r.locked_course_id)
        const cd = nom?.course_data || {}
        const fee = (parseFloat(cd.green_fee) || 0) + (parseFloat(cd.cart_fee) || 0)
        return { roundNumber: r.round_number, name: cd.name || 'Course', fee }
      })
      .filter(l => l.fee > 0)

    const lockedOption = lodging?.options?.find(o => o.id === lodging?.locked_option_id)
    const pricePerNight = parseFloat(lockedOption?.option_data?.price_per_night) || 0
    const lodgingPerPerson = nights > 0 && groupSize > 0 ? pricePerNight * nights / groupSize : 0

    const grandTotal = roundLines.reduce((s, l) => s + l.fee, 0) + lodgingPerPerson
    if (grandTotal === 0) return null

    const fmt = n => `$${Math.round(n).toLocaleString()}`

    return (
      <div style={{
        background: '#1a2a1a', border: '1px solid #2d4a2d', borderRadius: 8,
        padding: '14px 16px', marginBottom: 20,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: 10, fontSize: 15 }}>
          Cost Per Person
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          {roundLines.map(l => (
            <div key={l.roundNumber} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Round {l.roundNumber} · {l.name}</span>
              <span style={{ color: '#fff' }}>{fmt(l.fee)}</span>
            </div>
          ))}
          {lodgingPerPerson > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Lodging ({nights}n ÷ {groupSize} people)
              </span>
              <span style={{ color: '#fff' }}>{fmt(lodgingPerPerson)}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderTop: '1px solid #2d4a2d', paddingTop: 8,
            fontWeight: 700, fontSize: 15,
          }}>
            <span>Total per person</span>
            <span style={{ color: 'var(--accent-green)' }}>{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 6.2: Render CostBreakdown in the phase**

  In the `LockInPhase` component body, find the section that renders after `loadingData`:
  ```jsx
  {loadingData ? (
    <div style={{ color: 'var(--text-muted)' }}>Loading checklist...</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
  ```

  Change to:
  ```jsx
  {loadingData ? (
    <div style={{ color: 'var(--text-muted)' }}>Loading checklist...</div>
  ) : (
    <>
      <CostBreakdown rounds={rounds} lodging={lodging} trip={trip} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
  ```

  Then close the extra fragment — find the `</div>` that closes the checklist div (the one with `marginBottom: 28`) and add `</>` after it:
  ```jsx
        </div>  {/* closes checklist div */}
      </>        {/* closes the fragment from above */}
    )           {/* closes the ternary else */}
  }
  ```

- [ ] **Step 6.3: Commit**
  ```bash
  git add frontend/src/phases/lockin/LockInPhase.jsx
  git commit -m "feat: show per-person cost breakdown on Lock It In page"
  ```

---

## Verification

After all tasks complete, do a final sanity check:

- [ ] **Run full backend test suite**
  ```bash
  cd backend && .venv/Scripts/python.exe -m pytest backend/tests/ -v 2>&1 | tail -15
  ```
  Expected: 58+ tests pass, 0 fail.

- [ ] **Start frontend dev server and spot-check**
  ```bash
  cd frontend && npm run dev
  ```
  Check list:
  - Dashboard: "Your Trips" appears above "Trip Invites"
  - TripRoom on a narrow browser window: "👥 N ▼" chip appears in header, MemberPanel panel toggles on click
  - TripRoom phase tabs: no text wrap, horizontal scroll on narrow window
  - TripRoom pending tabs: show "Previous phase first" subtitle
  - TripRoom refresh: shows only ↺ icon, no text label
  - Availability calendar: days are taller (~44px), easy to tap
  - Availability heatmap header: shows "X of N responded" in amber when partial
  - Lock It In (with locked rounds): shows "Cost Per Person" breakdown above checklist

- [ ] **Final commit for untracked files cleanup**
  ```bash
  git status
  ```
  Confirm only `frontend/.env.production` and `frontend/.firebase/` remain untracked (expected — don't commit these).
