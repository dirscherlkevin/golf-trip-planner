# Restaurant Search — Design Spec
**Date:** 2026-06-02  
**Status:** Approved

---

## Overview

A post-lock-in restaurant discovery feature for the itinerary page (HypeMoment). Group members can search for food near each golf course or their lodging, powered by Claude Sonnet with Google Maps deep links. Results are transient; members can save picks to a shared group list and vote 👍/👎 to surface the best options.

---

## Use Cases

- Primary: post-round dinner — "we just finished Round 2, find us a steakhouse nearby"
- Secondary: trip-level dining — "what's good near our lodging in Stillwater"
- Timing: available after trip is finalized (HypeMoment page only), usable day-of

---

## User Experience

### Entry point
A **"🍽️ Find food near here"** button lives at the bottom of each `CourseCard` and `LodgingCard` on the HypeMoment itinerary page. Any trip member can use it.

### Filter drawer
Clicking the button expands a drawer attached to the card. All filters are optional — the only required input is location (derived automatically from the card).

**Filters:**
- **Vibe chips (multi-select, optional):** 🥩 Steakhouse, 🍺 Brewery, 🍸 Cocktail Bar, 📺 Sports Bar, 🍕 Pizza, 🔥 BBQ, 🍔 Burgers, 🐟 Seafood — none selected = any cuisine
- **Discover (multi-select, optional):** ⭐ Top Rated, 💎 Hidden Gem — both can be selected simultaneously
- **Hide chains toggle:** default off; when on, instructs Claude to exclude chain restaurants
- **Free text (optional):** "patio, live music, cheap" — passed as extra context to Claude

### Results
Claude returns 4–5 suggestions displayed as a compact list inside the drawer. Each result shows:
- Name
- Vibe badge (Top Rated / Hidden Gem) + cuisine type badge
- Cuisine type, price range ($ / $$ / $$$)
- Italic Sonnet blurb explaining why it was picked
- 📍 Google Maps link (search URL from name + location)
- 📌 Save button — adds to the group's shared pick list

Results are **transient** — they disappear on refresh. Only saved picks persist.

A **"↻ Try different filters"** button resets and re-opens the filter form.

### Saved picks strip
Once any member saves a pick, a **"🍽️ Dinner picks"** strip appears permanently on the card (above the search button), visible to all members without opening the drawer. Each saved pick shows:
- Name
- Vibe badge (Top Rated / Hidden Gem) + cuisine badge
- Price range + "saved by [Name]"
- Italic Sonnet blurb
- 📍 Google Maps link
- 👍 N / 👎 N vote buttons — one vote per member per pick (toggleable, up or down)

Picks are sorted by 👍 count descending.

### Saving flow
- **First save:** creates the canonical pick row + implicit 👍 vote for the saver
- **Other members:** vote 👍 or 👎 on existing picks — no duplicate saves needed
- **Remove vote:** any member can remove their vote; if all votes are removed (zero total), the pick auto-deletes from the list. A pick with only 👎 votes stays visible — it's useful group signal.
- **Organizer hard delete:** organizer can force-remove any pick regardless of votes

---

## Data Model

Two new tables, added via `CREATE TABLE IF NOT EXISTS` in `main.py` lifespan block:

```sql
CREATE TABLE IF NOT EXISTS restaurant_picks (
  id           SERIAL PRIMARY KEY,
  trip_id      INTEGER NOT NULL REFERENCES trips(id),
  round_id     INTEGER REFERENCES rounds(id),  -- NULL = lodging pick
  name         TEXT NOT NULL,
  cuisine      TEXT,
  price_range  TEXT,   -- '$', '$$', '$$$'
  vibe         TEXT,   -- 'top_rated' | 'hidden_gem' | 'both'
  reason       TEXT,   -- Sonnet blurb
  address      TEXT,   -- neighborhood/area, e.g. "downtown Northfield"
  phone        TEXT,   -- nullable; useful for group reservation calls
  maps_url     TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_votes (
  id         SERIAL PRIMARY KEY,
  pick_id    INTEGER NOT NULL REFERENCES restaurant_picks(id) ON DELETE CASCADE,
  user_id    INTEGER,
  user_name  TEXT NOT NULL,
  vote       TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  voted_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(pick_id, user_id)
);
```

`round_id = NULL` identifies picks from a lodging search.  
`restaurant_votes` cascades on pick delete — no orphan votes.

---

## Backend

### New file: `backend/api/restaurants.py`

| Endpoint | Auth | What it does |
|---|---|---|
| `POST /trips/{trip_id}/restaurants/suggest` | Member | Calls Claude, returns 4–5 suggestions. Not saved to DB. |
| `GET /trips/{trip_id}/restaurants` | Member | Returns all picks for the trip, with embedded votes list and `my_vote: "up" \| "down" \| null` per pick. Query param: `?round_id=` (omit for lodging picks). |
| `POST /trips/{trip_id}/restaurants` | Member | Creates a pick + adds an implicit 👍 vote for the caller. Body: full restaurant object from suggest response. Upserts on (name, round_id) to prevent duplicates. |
| `POST /trips/{trip_id}/restaurants/{pick_id}/vote` | Member | Toggle vote. Body: `{vote: "up" \| "down"}`. Switches vote if different type; removes if same type (second click). Auto-deletes pick if all votes removed. |
| `DELETE /trips/{trip_id}/restaurants/{pick_id}` | Organizer | Hard delete. |

### Suggest request body
```json
{
  "round_id": 12,
  "vibe_types": ["steakhouse", "brewery"],
  "discover_modes": ["top_rated", "hidden_gem"],
  "hide_chains": true,
  "extra_notes": "patio preferred"
}
```

Location is derived server-side:
- `round_id` provided → use `rounds.course_name` + `rounds.course_location`
- `round_id` null → use trip's locked lodging name + address

### New Claude service function: `suggest_restaurants()`

```python
suggest_restaurants(
  location: str,          # "Willingers Golf Club, Northfield, MN"
  group_size: int,
  vibe_types: list[str],  # [] = any
  discover_modes: list[str],
  hide_chains: bool,
  extra_notes: str
) -> list[dict]
```

Returns list of objects: `{name, cuisine, price_range, vibe, reason, address, phone, maps_search_query}`.  
Maps URL is built from `maps_search_query`: `https://www.google.com/maps/search/?api=1&query={encoded}`.  
Model: `claude-sonnet-4-6` (consistent with other enrichment functions).

---

## Frontend

### Modified: `frontend/src/phases/lockin/HypeMoment.jsx`

**`CourseCard` changes:**
- New state: `drawerOpen`, `filters`, `suggestions`, `loadingSuggest`, `savedPicks`, `loadingPicks`, `saving`
- On mount: `GET /restaurants?round_id={round.round_id}` → populate `savedPicks`
- Render saved picks strip when `savedPicks.length > 0` (above the search button)
- "Find food" button toggles `drawerOpen`
- Drawer: filter chips + search → POST suggest → render results list
- Each result: 📌 Save button → POST create pick → refresh `savedPicks`
- Each saved pick: 👍/👎 buttons (highlighted based on `my_vote`) → POST vote toggle → refresh `savedPicks`

**`LodgingCard` changes:**
- Identical logic, `round_id = null` passed to all API calls

### New file: `frontend/src/api/restaurants.js`

```js
export const suggestRestaurants = (tripId, params) =>
  client.post(`/trips/${tripId}/restaurants/suggest`, params).then(r => r.data)

export const getSavedPicks = (tripId, roundId) =>
  client.get(`/trips/${tripId}/restaurants`, { params: { round_id: roundId ?? null } }).then(r => r.data)

export const saveRestaurantPick = (tripId, data) =>
  client.post(`/trips/${tripId}/restaurants`, data).then(r => r.data)

export const voteOnPick = (tripId, pickId, vote) =>
  client.post(`/trips/${tripId}/restaurants/${pickId}/vote`, { vote }).then(r => r.data)

export const deleteRestaurantPick = (tripId, pickId) =>
  client.delete(`/trips/${tripId}/restaurants/${pickId}`).then(r => r.data)
```

---

## Filter chip reference

| Chip | Emoji | Value passed to Claude |
|---|---|---|
| Steakhouse | 🥩 | "steakhouse" |
| Brewery | 🍺 | "brewery" |
| Cocktail Bar | 🍸 | "cocktail bar" |
| Sports Bar | 📺 | "sports bar" |
| Pizza | 🍕 | "pizza" |
| BBQ | 🔥 | "bbq" |
| Burgers | 🍔 | "burgers" |
| Seafood | 🐟 | "seafood" |

---

## Out of scope (v1)

- Real-time restaurant data (Yelp / Google Places API) — Claude knowledge base is sufficient; Maps link-out provides ground truth
- Reservation booking — Maps link-out handles this
- Restaurant search during planning phase (pre-lock-in)

## Future enhancements

**Dietary / allergy filters (v2):** Add a dietary chip row to the filter drawer — Gluten Free, Vegetarian, Vegan, Nut-Free, Dairy-Free. Selected values get passed to Claude as hard requirements ("must have gluten-free options"). These would apply trip-wide or per-member via the global HCP-style profile (once that's built). For v1, the free-text field handles one-off cases ("gluten free options please").
