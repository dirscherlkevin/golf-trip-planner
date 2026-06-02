# Restaurant Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restaurant search feature to the post-lock-in itinerary page (HypeMoment) that lets any trip member search for food near each locked course or their lodging, powered by Claude Sonnet, with shared group picks and 👍/👎 voting.

**Architecture:** Two new DB tables (`restaurant_picks`, `restaurant_votes`) store the group's saved picks and votes. A new FastAPI router handles suggest (transient, calls Claude), save, list, vote, and delete. The `HypeMoment.jsx` `CourseCard` and `LodgingCard` components each get a collapsible filter drawer + persistent saved-picks strip.

**Tech Stack:** FastAPI + SQLAlchemy (raw SQL migrations in main.py), Claude Sonnet 4.6, React/Vite, Zustand auth store

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `backend/main.py` | Add 2 table migrations + register restaurants router |
| Modify | `backend/services/claude.py` | Add `suggest_restaurants()` function |
| Create | `backend/api/restaurants.py` | 5 endpoints: suggest, list, save, vote, delete |
| Create | `frontend/src/api/restaurants.js` | 5 API client functions |
| Modify | `frontend/src/phases/lockin/HypeMoment.jsx` | CourseCard + LodgingCard restaurant UI |

---

## Task 1: DB Migrations

**Files:**
- Modify: `backend/main.py` (in the `with engine.connect() as _conn:` block, before `_conn.commit()`)

- [ ] **Step 1: Add the two CREATE TABLE migrations**

Insert these two lines into `backend/main.py` immediately before the `_conn.commit()` line (around line 70):

```python
    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS restaurant_picks (
            id           SERIAL PRIMARY KEY,
            trip_id      INTEGER NOT NULL REFERENCES trips(id),
            round_id     INTEGER REFERENCES trip_rounds(id),
            name         TEXT NOT NULL,
            cuisine      TEXT,
            price_range  TEXT,
            vibe         TEXT,
            reason       TEXT,
            address      TEXT,
            phone        TEXT,
            maps_url     TEXT,
            created_at   TIMESTAMP DEFAULT NOW()
        )
    """))
    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS restaurant_votes (
            id         SERIAL PRIMARY KEY,
            pick_id    INTEGER NOT NULL REFERENCES restaurant_picks(id) ON DELETE CASCADE,
            user_id    INTEGER,
            user_name  TEXT NOT NULL,
            vote       TEXT NOT NULL CHECK (vote IN ('up', 'down')),
            voted_at   TIMESTAMP DEFAULT NOW(),
            UNIQUE(pick_id, user_id)
        )
    """))
```

- [ ] **Step 2: Start the backend and verify tables were created**

```bash
cd "c:/Claude AI/GolfTrip/backend"
uvicorn main:app --reload --port 8000
```

Expected: server starts without error. Then in a new terminal:

```bash
cd "c:/Claude AI/GolfTrip/backend"
python -c "
from database import engine
from sqlalchemy import text
with engine.connect() as c:
    r = c.execute(text(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('restaurant_picks','restaurant_votes')\"))
    print([row[0] for row in r])
"
```

Expected output: `['restaurant_picks', 'restaurant_votes']`

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add restaurant_picks and restaurant_votes DB tables"
```

---

## Task 2: Claude suggest_restaurants() Service Function

**Files:**
- Modify: `backend/services/claude.py` (append to end of file)

- [ ] **Step 1: Append the function to backend/services/claude.py**

```python
def suggest_restaurants(
    location: str,
    group_size: int,
    vibe_types: list,
    discover_modes: list,
    hide_chains: bool,
    extra_notes: str,
) -> list:
    """Return 4-5 restaurant suggestions near location as a list of dicts."""
    from urllib.parse import quote_plus

    vibe_str = ", ".join(vibe_types) if vibe_types else "any cuisine"
    chain_note = (
        " Do NOT include chain restaurants (e.g. Applebee's, Chili's, Olive Garden, TGI Fridays, Buffalo Wild Wings)."
        if hide_chains else ""
    )
    if discover_modes:
        if "top_rated" in discover_modes and "hidden_gem" in discover_modes:
            discover_note = "Include a mix of highly-rated local favorites AND lesser-known hidden gems."
        elif "top_rated" in discover_modes:
            discover_note = "Focus on highly-rated, well-reviewed restaurants."
        else:
            discover_note = "Focus on lesser-known local gems that tourists often miss."
    else:
        discover_note = "Include a good variety."
    extra = f" Additional preferences: {extra_notes.strip()}." if extra_notes.strip() else ""

    prompt = f"""You are a local dining expert. Suggest 4-5 restaurants near {location} for a golf group of {group_size} people finishing their round.

Cuisine preference: {vibe_str}{chain_note}
{discover_note}{extra}

Return ONLY a JSON array. Each object must have exactly these keys:
{{
  "name": "Restaurant name",
  "cuisine": "Short type label, e.g. Steakhouse, Brewery, American Grill",
  "price_range": "$" or "$$" or "$$$",
  "vibe": "top_rated" or "hidden_gem" or "both",
  "reason": "1-2 sentences — why great for a golf group, conversational and specific",
  "address": "Neighborhood or area only, e.g. 'downtown Northfield' or '2 miles from the course'",
  "phone": "Phone number string or null if unknown",
  "maps_search_query": "Best Google Maps search string, e.g. 'Tavern on the Town Northfield MN'"
}}

Return only the JSON array, no other text."""

    client = _client()
    message = _call_with_retry(lambda: client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    ))
    results = _parse_json_response(message.content[0].text)
    if not isinstance(results, list):
        raise ValueError("Expected a JSON array of restaurant suggestions")

    for r in results:
        query = r.get("maps_search_query") or r.get("name", "")
        r["maps_url"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}"

    return results
```

- [ ] **Step 2: Smoke-test the function from a Python shell**

```bash
cd "c:/Claude AI/GolfTrip/backend"
python -c "
from services.claude import suggest_restaurants
results = suggest_restaurants(
    location='Willingers Golf Club, Northfield, MN',
    group_size=4,
    vibe_types=['steakhouse'],
    discover_modes=['top_rated'],
    hide_chains=True,
    extra_notes='',
)
import json; print(json.dumps(results, indent=2))
"
```

Expected: JSON array of 4-5 objects each with name, cuisine, price_range, vibe, reason, address, phone, maps_url, maps_search_query.

- [ ] **Step 3: Commit**

```bash
git add backend/services/claude.py
git commit -m "feat: add suggest_restaurants() Claude service function"
```

---

## Task 3: Backend restaurants.py — Skeleton + Suggest Endpoint

**Files:**
- Create: `backend/api/restaurants.py`

- [ ] **Step 1: Create the file with skeleton, models, and suggest endpoint**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from api.auth import get_current_user
from models.trip import Trip, TripMember
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption
from services.claude import suggest_restaurants

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_member(trip_id: int, user, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "joined",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip


def _derive_location(trip_id: int, round_id: Optional[int], trip: Trip, db: Session) -> str:
    if round_id is not None:
        trip_round = db.query(TripRound).filter(
            TripRound.id == round_id,
            TripRound.trip_id == trip_id,
        ).first()
        if trip_round and trip_round.locked_course_id:
            nomination = db.query(CourseNomination).filter(
                CourseNomination.id == trip_round.locked_course_id
            ).first()
            if nomination:
                cd = nomination.course_data or {}
                name = cd.get("name", "")
                loc = cd.get("location", "")
                return f"{name}, {loc}".strip(", ") or "the golf course"
        return f"Round {round_id} course"

    # Lodging fallback
    lodging = db.query(LodgingOption).filter(
        LodgingOption.trip_id == trip_id,
        LodgingOption.is_locked == True,
    ).first()
    if lodging:
        od = lodging.option_data or {}
        name = od.get("name", "")
        addr = od.get("address", "")
        return f"{name}, {addr}".strip(", ") or "the lodging"

    # Destination fallback
    dest = db.execute(
        text("SELECT locked_destination FROM destination_suggestions WHERE trip_id = :tid"),
        {"tid": trip_id},
    ).fetchone()
    if dest and dest.locked_destination:
        return dest.locked_destination.get("name", "the destination")

    return "the destination"


# ── schemas ───────────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    round_id: Optional[int] = None
    vibe_types: List[str] = []
    discover_modes: List[str] = []
    hide_chains: bool = False
    extra_notes: str = ""


class SavePickRequest(BaseModel):
    round_id: Optional[int] = None
    name: str
    cuisine: Optional[str] = None
    price_range: Optional[str] = None
    vibe: Optional[str] = None
    reason: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    maps_url: Optional[str] = None


class VoteRequest(BaseModel):
    vote: str  # "up" | "down"


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{trip_id}/restaurants/suggest")
def suggest(
    trip_id: int,
    body: SuggestRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_member(trip_id, user, db)
    location = _derive_location(trip_id, body.round_id, trip, db)

    member_count = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined",
    ).count()

    results = suggest_restaurants(
        location=location,
        group_size=member_count or 4,
        vibe_types=body.vibe_types,
        discover_modes=body.discover_modes,
        hide_chains=body.hide_chains,
        extra_notes=body.extra_notes,
    )
    return results
```

- [ ] **Step 2: Register the router in main.py**

Add these two lines after the last `app.include_router` call in `backend/main.py`:

```python
from api.restaurants import router as restaurants_router
app.include_router(restaurants_router, prefix="/trips", tags=["restaurants"])
```

Wait — the suggest endpoint is `/{trip_id}/restaurants/suggest` on the router, and the router is included with `prefix="/trips"`, giving the final path `/trips/{trip_id}/restaurants/suggest`. That's correct.

- [ ] **Step 3: Manually test the suggest endpoint**

Start the server (`uvicorn main:app --reload`) and test with curl (replace TOKEN and IDs):

```bash
curl -X POST http://localhost:8000/trips/1/restaurants/suggest \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"round_id": 1, "vibe_types": ["steakhouse"], "discover_modes": ["top_rated"], "hide_chains": true, "extra_notes": ""}'
```

Expected: JSON array of 4-5 restaurant objects.

- [ ] **Step 4: Commit**

```bash
git add backend/api/restaurants.py backend/main.py
git commit -m "feat: restaurants suggest endpoint + router registration"
```

---

## Task 4: Backend restaurants.py — List + Save Endpoints

**Files:**
- Modify: `backend/api/restaurants.py` (append to end of file)

- [ ] **Step 1: Append the GET (list) endpoint**

```python
@router.get("/{trip_id}/restaurants")
def get_picks(
    trip_id: int,
    round_id: Optional[int] = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)

    picks = db.execute(
        text("""
            SELECT * FROM restaurant_picks
            WHERE trip_id = :tid
            AND (
                (:rid IS NULL AND round_id IS NULL) OR
                (round_id = :rid)
            )
            ORDER BY created_at
        """),
        {"tid": trip_id, "rid": round_id},
    ).fetchall()

    result = []
    for p in picks:
        votes = db.execute(
            text("SELECT user_name, vote FROM restaurant_votes WHERE pick_id = :pid"),
            {"pid": p.id},
        ).fetchall()
        up_voters = [v.user_name for v in votes if v.vote == "up"]
        down_voters = [v.user_name for v in votes if v.vote == "down"]
        my_vote_row = db.execute(
            text("SELECT vote FROM restaurant_votes WHERE pick_id = :pid AND user_id = :uid"),
            {"pid": p.id, "uid": user.id},
        ).fetchone()
        result.append({
            "id": p.id,
            "round_id": p.round_id,
            "name": p.name,
            "cuisine": p.cuisine,
            "price_range": p.price_range,
            "vibe": p.vibe,
            "reason": p.reason,
            "address": p.address,
            "phone": p.phone,
            "maps_url": p.maps_url,
            "up_votes": up_voters,
            "down_votes": down_voters,
            "my_vote": my_vote_row.vote if my_vote_row else None,
        })

    result.sort(key=lambda x: len(x["up_votes"]), reverse=True)
    return result
```

- [ ] **Step 2: Append the POST (save) endpoint**

```python
@router.post("/{trip_id}/restaurants")
def save_pick(
    trip_id: int,
    body: SavePickRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)

    # Upsert: find existing pick by (trip_id, name, round_id)
    existing = db.execute(
        text("""
            SELECT id FROM restaurant_picks
            WHERE trip_id = :tid AND name = :name
            AND (
                (:rid IS NULL AND round_id IS NULL) OR
                (round_id = :rid)
            )
        """),
        {"tid": trip_id, "name": body.name, "rid": body.round_id},
    ).fetchone()

    if existing:
        pick_id = existing.id
    else:
        row = db.execute(
            text("""
                INSERT INTO restaurant_picks
                    (trip_id, round_id, name, cuisine, price_range, vibe, reason, address, phone, maps_url)
                VALUES
                    (:tid, :rid, :name, :cuisine, :price_range, :vibe, :reason, :address, :phone, :maps_url)
                RETURNING id
            """),
            {
                "tid": trip_id, "rid": body.round_id, "name": body.name,
                "cuisine": body.cuisine, "price_range": body.price_range,
                "vibe": body.vibe, "reason": body.reason,
                "address": body.address, "phone": body.phone, "maps_url": body.maps_url,
            },
        ).fetchone()
        pick_id = row.id

    # Implicit up-vote for the saver (upsert)
    db.execute(
        text("""
            INSERT INTO restaurant_votes (pick_id, user_id, user_name, vote)
            VALUES (:pid, :uid, :uname, 'up')
            ON CONFLICT (pick_id, user_id) DO UPDATE SET vote = 'up'
        """),
        {"pid": pick_id, "uid": user.id, "uname": user.name},
    )
    db.commit()
    return {"id": pick_id}
```

- [ ] **Step 3: Manually test save + list**

```bash
# Save a pick
curl -X POST http://localhost:8000/trips/1/restaurants \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"round_id": 1, "name": "Test Tavern", "cuisine": "Bar & Grill", "price_range": "$$", "vibe": "top_rated", "reason": "Great test spot", "maps_url": "https://maps.google.com"}'

# List picks for round 1
curl http://localhost:8000/trips/1/restaurants?round_id=1 \
  -H "Authorization: Bearer TOKEN"
```

Expected: save returns `{"id": N}`, list returns array with 1 item including `up_votes: ["Your Name"]` and `my_vote: "up"`.

- [ ] **Step 4: Commit**

```bash
git add backend/api/restaurants.py
git commit -m "feat: restaurants list + save endpoints"
```

---

## Task 5: Backend restaurants.py — Vote + Delete Endpoints

**Files:**
- Modify: `backend/api/restaurants.py` (append to end of file)

- [ ] **Step 1: Append the vote endpoint**

```python
@router.post("/{trip_id}/restaurants/{pick_id}/vote")
def vote_pick(
    trip_id: int,
    pick_id: int,
    body: VoteRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)
    if body.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")

    # Verify pick belongs to this trip
    pick = db.execute(
        text("SELECT id FROM restaurant_picks WHERE id = :pid AND trip_id = :tid"),
        {"pid": pick_id, "tid": trip_id},
    ).fetchone()
    if not pick:
        raise HTTPException(status_code=404, detail="Pick not found")

    existing = db.execute(
        text("SELECT vote FROM restaurant_votes WHERE pick_id = :pid AND user_id = :uid"),
        {"pid": pick_id, "uid": user.id},
    ).fetchone()

    if existing and existing.vote == body.vote:
        # Same vote again — toggle off (remove)
        db.execute(
            text("DELETE FROM restaurant_votes WHERE pick_id = :pid AND user_id = :uid"),
            {"pid": pick_id, "uid": user.id},
        )
    else:
        # New vote or switching direction — upsert
        db.execute(
            text("""
                INSERT INTO restaurant_votes (pick_id, user_id, user_name, vote)
                VALUES (:pid, :uid, :uname, :vote)
                ON CONFLICT (pick_id, user_id) DO UPDATE SET vote = :vote
            """),
            {"pid": pick_id, "uid": user.id, "uname": user.name, "vote": body.vote},
        )

    db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Append the delete endpoint**

```python
@router.delete("/{trip_id}/restaurants/{pick_id}")
def delete_pick(
    trip_id: int,
    pick_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)
    db.execute(
        text("DELETE FROM restaurant_picks WHERE id = :id AND trip_id = :tid"),
        {"id": pick_id, "tid": trip_id},
    )
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Manually test vote toggle**

```bash
# Vote up on pick ID 1
curl -X POST http://localhost:8000/trips/1/restaurants/1/vote \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vote": "up"}'

# Vote up again — should toggle off
curl -X POST http://localhost:8000/trips/1/restaurants/1/vote \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vote": "up"}'

# List picks — my_vote should be null after double-up
curl "http://localhost:8000/trips/1/restaurants?round_id=1" \
  -H "Authorization: Bearer TOKEN"
```

Expected: first vote sets `my_vote: "up"`, second vote on same direction sets `my_vote: null`.

- [ ] **Step 4: Commit**

```bash
git add backend/api/restaurants.py
git commit -m "feat: restaurants vote + delete endpoints"
```

---

## Task 6: Frontend API Module

**Files:**
- Create: `frontend/src/api/restaurants.js`

- [ ] **Step 1: Create the file**

```js
import client from './client'

export const suggestRestaurants = (tripId, params) =>
  client.post(`/trips/${tripId}/restaurants/suggest`, params).then(r => r.data)

export const getSavedPicks = (tripId, roundId) => {
  const params = roundId != null ? { round_id: roundId } : {}
  return client.get(`/trips/${tripId}/restaurants`, { params }).then(r => r.data)
}

export const saveRestaurantPick = (tripId, data) =>
  client.post(`/trips/${tripId}/restaurants`, data).then(r => r.data)

export const voteOnPick = (tripId, pickId, vote) =>
  client.post(`/trips/${tripId}/restaurants/${pickId}/vote`, { vote }).then(r => r.data)

export const deleteRestaurantPick = (tripId, pickId) =>
  client.delete(`/trips/${tripId}/restaurants/${pickId}`).then(r => r.data)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/restaurants.js
git commit -m "feat: restaurants API client module"
```

---

## Task 7: HypeMoment.jsx — CourseCard Restaurant Feature

**Files:**
- Modify: `frontend/src/phases/lockin/HypeMoment.jsx`

This task adds the restaurant drawer and saved-picks strip to `CourseCard`. The component is defined starting around line 176.

- [ ] **Step 1: Add the import at the top of HypeMoment.jsx**

After the existing `import client from '../../api/client'` line (line 2), add:

```js
import { suggestRestaurants, getSavedPicks, saveRestaurantPick, voteOnPick, deleteRestaurantPick } from '../../api/restaurants'
```

Also add `useEffect` to the existing React import if not already present (it is — line 1 shows `import { useState, useEffect } from 'react'`). No change needed there.

- [ ] **Step 2: Add chip constants above the CourseCard function definition (around line 176)**

```js
const VIBE_CHIPS = [
  { label: '🥩 Steakhouse', value: 'steakhouse' },
  { label: '🍺 Brewery', value: 'brewery' },
  { label: '🍸 Cocktail Bar', value: 'cocktail bar' },
  { label: '📺 Sports Bar', value: 'sports bar' },
  { label: '🍕 Pizza', value: 'pizza' },
  { label: '🔥 BBQ', value: 'bbq' },
  { label: '🍔 Burgers', value: 'burgers' },
  { label: '🐟 Seafood', value: 'seafood' },
]

const DISCOVER_CHIPS = [
  { label: '⭐ Top Rated', value: 'top_rated' },
  { label: '💎 Hidden Gem', value: 'hidden_gem' },
]

const VIBE_BADGE = {
  top_rated:  { label: '⭐ Top Rated', color: '#cc9900', bg: 'rgba(204,153,0,0.1)',    border: 'rgba(204,153,0,0.3)' },
  hidden_gem: { label: '💎 Hidden Gem', color: '#6699cc', bg: 'rgba(102,153,204,0.1)', border: 'rgba(102,153,204,0.3)' },
  both:       { label: '⭐💎 Both',     color: '#5a9a5a', bg: 'rgba(90,154,90,0.1)',   border: 'rgba(90,154,90,0.3)' },
}
```

- [ ] **Step 3: Add restaurant state inside the CourseCard function body**

Inside `function CourseCard(...)`, after the existing state declarations (`const [booked, ...]`), add:

```js
  const [restDrawerOpen, setRestDrawerOpen] = useState(false)
  const [filters, setFilters] = useState({ vibes: [], discover: [], hideChains: false, extraNotes: '' })
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [savedPicks, setSavedPicks] = useState([])

  useEffect(() => {
    if (!tripId || !round.round_id) return
    getSavedPicks(tripId, round.round_id).then(setSavedPicks).catch(() => {})
  }, [tripId, round.round_id])

  const refreshPicks = () =>
    getSavedPicks(tripId, round.round_id).then(setSavedPicks).catch(() => {})

  const handleSuggest = async () => {
    setLoadingSuggest(true)
    setSuggestions([])
    try {
      const results = await suggestRestaurants(tripId, {
        round_id: round.round_id,
        vibe_types: filters.vibes,
        discover_modes: filters.discover,
        hide_chains: filters.hideChains,
        extra_notes: filters.extraNotes,
      })
      setSuggestions(results)
    } catch { /* silent */ }
    finally { setLoadingSuggest(false) }
  }

  const handleSavePick = async (s) => {
    try {
      await saveRestaurantPick(tripId, {
        round_id: round.round_id,
        name: s.name, cuisine: s.cuisine, price_range: s.price_range,
        vibe: s.vibe, reason: s.reason, address: s.address,
        phone: s.phone, maps_url: s.maps_url,
      })
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleVote = async (pickId, vote) => {
    try {
      await voteOnPick(tripId, pickId, vote)
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleRemovePick = async (pickId) => {
    try {
      await deleteRestaurantPick(tripId, pickId)
      setSavedPicks(p => p.filter(x => x.id !== pickId))
    } catch { /* silent */ }
  }

  const toggleChip = (field, value) =>
    setFilters(f => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value],
    }))
```

- [ ] **Step 4: Add the restaurant section to CourseCard's JSX return**

Find the closing `</div>` of the outermost card div in `CourseCard` (the one wrapping everything, ending around line 274). Insert this block immediately before that final `</div>`:

```jsx
      {/* ── Restaurant section ── */}
      {savedPicks.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#0a150a', border: '1px solid #1d3a1d', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#5a9a5a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🍽️ Dinner picks — after this round
          </div>
          {savedPicks.map(pick => {
            const badge = VIBE_BADGE[pick.vibe]
            return (
              <div key={pick.id} style={{ background: '#111', border: '1px solid #2a3a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{pick.name}</span>
                      {badge && (
                        <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                          {badge.label}
                        </span>
                      )}
                      {pick.cuisine && (
                        <span style={{ fontSize: 9, color: '#888', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                          {pick.cuisine}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: pick.reason ? 4 : 0 }}>
                      {[pick.price_range, pick.address].filter(Boolean).join(' · ')}
                      {pick.up_votes?.length > 0 && ` · saved by ${pick.up_votes.slice(0, 2).join(', ')}${pick.up_votes.length > 2 ? ` +${pick.up_votes.length - 2}` : ''}`}
                    </div>
                    {pick.reason && (
                      <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{pick.reason}"</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {pick.maps_url && (
                        <a href={pick.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                      )}
                      {pick.phone && <span style={{ fontSize: 11, color: '#666' }}>{pick.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => handleVote(pick.id, 'up')}
                      style={{ background: pick.my_vote === 'up' ? '#1a2a1a' : 'none', border: `1px solid ${pick.my_vote === 'up' ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'up' ? '#5a9a5a' : '#555', cursor: 'pointer' }}>
                      👍 {pick.up_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleVote(pick.id, 'down')}
                      style={{ background: pick.my_vote === 'down' ? '#2a1a1a' : 'none', border: `1px solid ${pick.my_vote === 'down' ? '#6a3a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'down' ? '#9a5a5a' : '#555', cursor: 'pointer' }}>
                      👎 {pick.down_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleRemovePick(pick.id)}
                      style={{ background: 'none', border: 'none', fontSize: 10, color: '#444', cursor: 'pointer', padding: '2px 4px' }}
                      title="Remove pick">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Search drawer ── */}
      <div style={{ marginTop: savedPicks.length > 0 ? 6 : 12 }}>
        <button
          onClick={() => { setRestDrawerOpen(o => !o); setSuggestions([]) }}
          style={{ width: '100%', background: 'none', border: '1px solid #2d4a2d', borderRadius: 6, color: '#5a9a5a', fontSize: 11, padding: '6px', cursor: 'pointer' }}>
          🍽️ {savedPicks.length > 0 ? 'Search for more restaurants' : 'Find food near this course'} {restDrawerOpen ? '▴' : '▾'}
        </button>

        {restDrawerOpen && (
          <div style={{ marginTop: 6, padding: '12px 14px', background: '#111', border: '1px solid #1d3a1d', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Vibe</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {VIBE_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('vibes', chip.value)}
                  style={{ background: filters.vibes.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.vibes.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.vibes.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              {filters.vibes.length === 0 && <span style={{ fontSize: 10, color: '#444', alignSelf: 'center' }}>none = any type</span>}
            </div>

            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Discover</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {DISCOVER_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('discover', chip.value)}
                  style={{ background: filters.discover.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.discover.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.discover.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: filters.hideChains ? '#5a9a5a' : '#666', marginLeft: 'auto' }}>
                <div style={{ width: 28, height: 16, background: filters.hideChains ? '#2d4a2d' : '#222', borderRadius: 8, position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ width: 12, height: 12, background: filters.hideChains ? '#5a9a5a' : '#555', borderRadius: '50%', position: 'absolute', right: filters.hideChains ? 2 : 14, top: 2, transition: 'right 0.2s' }} />
                </div>
                Hide chains
                <input type="checkbox" checked={filters.hideChains} onChange={e => setFilters(f => ({ ...f, hideChains: e.target.checked }))} style={{ display: 'none' }} />
              </label>
            </div>

            <input
              placeholder="Anything else? (patio, live music, cheap...)"
              value={filters.extraNotes}
              onChange={e => setFilters(f => ({ ...f, extraNotes: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 11, marginBottom: 8 }}
            />

            <button onClick={handleSuggest} disabled={loadingSuggest}
              style={{ width: '100%', background: '#2d4a2d', border: 'none', borderRadius: 6, color: '#7ab87a', fontSize: 12, fontWeight: 600, padding: '8px', cursor: 'pointer' }}>
              {loadingSuggest ? '✨ Finding spots...' : '✨ Find restaurants'}
            </button>

            {suggestions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#5a9a5a', marginBottom: 8 }}>✨ {suggestions.length} spots near this course</div>
                {suggestions.map((s, i) => {
                  const badge = VIBE_BADGE[s.vibe]
                  const alreadySaved = savedPicks.some(p => p.name === s.name)
                  return (
                    <div key={i} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{s.name}</span>
                            {badge && (
                              <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                                {badge.label}
                              </span>
                            )}
                            {s.cuisine && (
                              <span style={{ fontSize: 9, color: '#888', background: '#111', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                                {s.cuisine}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: s.reason ? 4 : 0 }}>
                            {[s.price_range, s.address].filter(Boolean).join(' · ')}
                          </div>
                          {s.reason && (
                            <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{s.reason}"</div>
                          )}
                          {s.maps_url && (
                            <a href={s.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                          )}
                        </div>
                        <button
                          onClick={() => handleSavePick(s)}
                          disabled={alreadySaved}
                          style={{ background: alreadySaved ? '#2d4a2d' : 'none', border: `1px solid ${alreadySaved ? '#3a6a3a' : '#333'}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, color: alreadySaved ? '#5a9a5a' : '#888', cursor: alreadySaved ? 'default' : 'pointer', flexShrink: 0 }}>
                          {alreadySaved ? '📌 Saved' : '📌 Save'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => { setSuggestions([]); setFilters({ vibes: [], discover: [], hideChains: false, extraNotes: '' }) }}
                  style={{ width: '100%', background: 'none', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', fontSize: 11, padding: '5px', cursor: 'pointer', marginTop: 4 }}>
                  ↻ Try different filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 5: Start the frontend dev server and test CourseCard**

```bash
cd "c:/Claude AI/GolfTrip/frontend"
npm run dev
```

Navigate to a finalized trip's itinerary page (HypeMoment). Verify:
1. "Find food near this course" button appears on each course card
2. Clicking it expands the drawer with vibe chips, discover chips, hide-chains toggle, extra notes field
3. "✨ Find restaurants" returns results with badges and Maps links
4. "📌 Save" on a result adds it to the saved picks strip above the button
5. Saved picks show the vibe badge, cuisine badge, Sonnet blurb
6. 👍/👎 buttons work (highlighted state, count updates)
7. ✕ removes a pick

- [ ] **Step 6: Commit**

```bash
git add frontend/src/phases/lockin/HypeMoment.jsx frontend/src/api/restaurants.js
git commit -m "feat: restaurant search + saved picks on CourseCard"
```

---

## Task 8: HypeMoment.jsx — LodgingCard Restaurant Feature

**Files:**
- Modify: `frontend/src/phases/lockin/HypeMoment.jsx` — `LodgingCard` function (lines ~276–340)

The `LodgingCard` component gets identical restaurant functionality with two differences: `round_id` is always `null`, and the button label says "Find food near lodging".

- [ ] **Step 1: Add restaurant state inside the LodgingCard function body**

Inside `function LodgingCard(...)`, after the existing state declarations, add:

```js
  const [restDrawerOpen, setRestDrawerOpen] = useState(false)
  const [filters, setFilters] = useState({ vibes: [], discover: [], hideChains: false, extraNotes: '' })
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [savedPicks, setSavedPicks] = useState([])

  useEffect(() => {
    if (!tripId) return
    getSavedPicks(tripId, null).then(setSavedPicks).catch(() => {})
  }, [tripId])

  const refreshPicks = () =>
    getSavedPicks(tripId, null).then(setSavedPicks).catch(() => {})

  const handleSuggest = async () => {
    setLoadingSuggest(true)
    setSuggestions([])
    try {
      const results = await suggestRestaurants(tripId, {
        round_id: null,
        vibe_types: filters.vibes,
        discover_modes: filters.discover,
        hide_chains: filters.hideChains,
        extra_notes: filters.extraNotes,
      })
      setSuggestions(results)
    } catch { /* silent */ }
    finally { setLoadingSuggest(false) }
  }

  const handleSavePick = async (s) => {
    try {
      await saveRestaurantPick(tripId, {
        round_id: null,
        name: s.name, cuisine: s.cuisine, price_range: s.price_range,
        vibe: s.vibe, reason: s.reason, address: s.address,
        phone: s.phone, maps_url: s.maps_url,
      })
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleVote = async (pickId, vote) => {
    try {
      await voteOnPick(tripId, pickId, vote)
      await refreshPicks()
    } catch { /* silent */ }
  }

  const handleRemovePick = async (pickId) => {
    try {
      await deleteRestaurantPick(tripId, pickId)
      setSavedPicks(p => p.filter(x => x.id !== pickId))
    } catch { /* silent */ }
  }

  const toggleChip = (field, value) =>
    setFilters(f => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value],
    }))
```

- [ ] **Step 2: Add the restaurant section to LodgingCard's JSX return**

Find the final closing `</div>` of the `LodgingCard` return (after the `BookedCheck` / booked display). Insert immediately before that closing tag, using the same JSX block as CourseCard Task 7 Step 4 — with two changes:

1. The saved picks header: `🍽️ Dining picks — near lodging`
2. The search button label: `'Find food near lodging'` (instead of `'Find food near this course'`)

The full block to insert:

```jsx
      {/* ── Restaurant section ── */}
      {savedPicks.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#0a150a', border: '1px solid #1d3a1d', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#5a9a5a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🍽️ Dining picks — near lodging
          </div>
          {savedPicks.map(pick => {
            const badge = VIBE_BADGE[pick.vibe]
            return (
              <div key={pick.id} style={{ background: '#111', border: '1px solid #2a3a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{pick.name}</span>
                      {badge && (
                        <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                          {badge.label}
                        </span>
                      )}
                      {pick.cuisine && (
                        <span style={{ fontSize: 9, color: '#888', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                          {pick.cuisine}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: pick.reason ? 4 : 0 }}>
                      {[pick.price_range, pick.address].filter(Boolean).join(' · ')}
                      {pick.up_votes?.length > 0 && ` · saved by ${pick.up_votes.slice(0, 2).join(', ')}${pick.up_votes.length > 2 ? ` +${pick.up_votes.length - 2}` : ''}`}
                    </div>
                    {pick.reason && (
                      <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{pick.reason}"</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {pick.maps_url && (
                        <a href={pick.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                      )}
                      {pick.phone && <span style={{ fontSize: 11, color: '#666' }}>{pick.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => handleVote(pick.id, 'up')}
                      style={{ background: pick.my_vote === 'up' ? '#1a2a1a' : 'none', border: `1px solid ${pick.my_vote === 'up' ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'up' ? '#5a9a5a' : '#555', cursor: 'pointer' }}>
                      👍 {pick.up_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleVote(pick.id, 'down')}
                      style={{ background: pick.my_vote === 'down' ? '#2a1a1a' : 'none', border: `1px solid ${pick.my_vote === 'down' ? '#6a3a3a' : '#2a2a2a'}`, borderRadius: 6, padding: '3px 9px', fontSize: 12, color: pick.my_vote === 'down' ? '#9a5a5a' : '#555', cursor: 'pointer' }}>
                      👎 {pick.down_votes?.length ?? 0}
                    </button>
                    <button
                      onClick={() => handleRemovePick(pick.id)}
                      style={{ background: 'none', border: 'none', fontSize: 10, color: '#444', cursor: 'pointer', padding: '2px 4px' }}
                      title="Remove pick">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Search drawer ── */}
      <div style={{ marginTop: savedPicks.length > 0 ? 6 : 12 }}>
        <button
          onClick={() => { setRestDrawerOpen(o => !o); setSuggestions([]) }}
          style={{ width: '100%', background: 'none', border: '1px solid #2d4a2d', borderRadius: 6, color: '#5a9a5a', fontSize: 11, padding: '6px', cursor: 'pointer' }}>
          🍽️ {savedPicks.length > 0 ? 'Search for more restaurants' : 'Find food near lodging'} {restDrawerOpen ? '▴' : '▾'}
        </button>

        {restDrawerOpen && (
          <div style={{ marginTop: 6, padding: '12px 14px', background: '#111', border: '1px solid #1d3a1d', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Vibe</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {VIBE_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('vibes', chip.value)}
                  style={{ background: filters.vibes.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.vibes.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.vibes.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              {filters.vibes.length === 0 && <span style={{ fontSize: 10, color: '#444', alignSelf: 'center' }}>none = any type</span>}
            </div>

            <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Discover</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              {DISCOVER_CHIPS.map(chip => (
                <button key={chip.value}
                  onClick={() => toggleChip('discover', chip.value)}
                  style={{ background: filters.discover.includes(chip.value) ? '#1a2a1a' : 'none', border: `1px solid ${filters.discover.includes(chip.value) ? '#3a6a3a' : '#2a2a2a'}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: filters.discover.includes(chip.value) ? '#7ab87a' : '#666', cursor: 'pointer' }}>
                  {chip.label}
                </button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: filters.hideChains ? '#5a9a5a' : '#666', marginLeft: 'auto' }}>
                <div style={{ width: 28, height: 16, background: filters.hideChains ? '#2d4a2d' : '#222', borderRadius: 8, position: 'relative' }}>
                  <div style={{ width: 12, height: 12, background: filters.hideChains ? '#5a9a5a' : '#555', borderRadius: '50%', position: 'absolute', right: filters.hideChains ? 2 : 14, top: 2 }} />
                </div>
                Hide chains
                <input type="checkbox" checked={filters.hideChains} onChange={e => setFilters(f => ({ ...f, hideChains: e.target.checked }))} style={{ display: 'none' }} />
              </label>
            </div>

            <input
              placeholder="Anything else? (patio, live music, cheap...)"
              value={filters.extraNotes}
              onChange={e => setFilters(f => ({ ...f, extraNotes: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 11, marginBottom: 8 }}
            />

            <button onClick={handleSuggest} disabled={loadingSuggest}
              style={{ width: '100%', background: '#2d4a2d', border: 'none', borderRadius: 6, color: '#7ab87a', fontSize: 12, fontWeight: 600, padding: '8px', cursor: 'pointer' }}>
              {loadingSuggest ? '✨ Finding spots...' : '✨ Find restaurants'}
            </button>

            {suggestions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#5a9a5a', marginBottom: 8 }}>✨ {suggestions.length} spots near lodging</div>
                {suggestions.map((s, i) => {
                  const badge = VIBE_BADGE[s.vibe]
                  const alreadySaved = savedPicks.some(p => p.name === s.name)
                  return (
                    <div key={i} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{s.name}</span>
                            {badge && (
                              <span style={{ fontSize: 9, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 3, padding: '1px 5px' }}>
                                {badge.label}
                              </span>
                            )}
                            {s.cuisine && (
                              <span style={{ fontSize: 9, color: '#888', background: '#111', border: '1px solid #2d2d2d', borderRadius: 3, padding: '1px 5px' }}>
                                {s.cuisine}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: s.reason ? 4 : 0 }}>
                            {[s.price_range, s.address].filter(Boolean).join(' · ')}
                          </div>
                          {s.reason && (
                            <div style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 5 }}>"{s.reason}"</div>
                          )}
                          {s.maps_url && (
                            <a href={s.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6699cc' }}>📍 Maps ↗</a>
                          )}
                        </div>
                        <button
                          onClick={() => handleSavePick(s)}
                          disabled={alreadySaved}
                          style={{ background: alreadySaved ? '#2d4a2d' : 'none', border: `1px solid ${alreadySaved ? '#3a6a3a' : '#333'}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, color: alreadySaved ? '#5a9a5a' : '#888', cursor: alreadySaved ? 'default' : 'pointer', flexShrink: 0 }}>
                          {alreadySaved ? '📌 Saved' : '📌 Save'}
                        </button>
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => { setSuggestions([]); setFilters({ vibes: [], discover: [], hideChains: false, extraNotes: '' }) }}
                  style={{ width: '100%', background: 'none', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', fontSize: 11, padding: '5px', cursor: 'pointer', marginTop: 4 }}>
                  ↻ Try different filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 3: Verify LodgingCard in the browser**

On the itinerary page, scroll to the "Where We're Staying" section. Verify:
1. "Find food near lodging" button appears on the lodging card
2. Search works and returns results for the lodging's location
3. Saves are independent from the course picks (different `round_id = null`)

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/phases/lockin/HypeMoment.jsx
git commit -m "feat: restaurant search + saved picks on LodgingCard"
```

---

## Self-Review Notes

- `_derive_location` falls back through round → lodging → destination suggestion → hardcoded string. All paths covered.
- `IS NOT DISTINCT FROM` in SQL handles NULL equality correctly for round_id filtering.
- Save endpoint upserts on (trip_id, name, round_id) — prevents duplicates if the same user saves the same pick twice.
- Voting: second click on same vote direction removes it (toggle off). Clicking a different direction switches. Pick row is never auto-deleted by votes.
- `user.name` is the correct field (models/user.py shows `name = Column(String)`).
- VIBE_CHIPS / DISCOVER_CHIPS / VIBE_BADGE constants defined once above CourseCard and reused by LodgingCard (both components share the module scope).
