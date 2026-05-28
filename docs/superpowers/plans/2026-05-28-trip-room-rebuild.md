# Golf Trip Planner — Trip Room Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Crew reviews:** At the end of each milestone, spawn the trip-planner, designer, developer, and low-handicap-golfer subagents in parallel to review the milestone before proceeding to the next.

**Goal:** Replace the 3-step wizard with a 4-phase Trip Room (Availability → AI Destinations → Courses+Lodging → Lock It In) powered by Claude API, with a phase state machine, budget votes, overlap heatmap, round-by-round course voting, lodging voting, running cost estimate, and a shareable finalization page.

**Architecture:** Phase-gated Trip Room where each phase has an explicit status (`pending → open → locked`). Claude API results are persisted to DB on first success and served from DB thereafter. Email is async via an `email_queue` table with a background worker.

**Tech Stack:** FastAPI + SQLAlchemy + PostgreSQL + React 18 + Zustand + Anthropic Python SDK

**Spec:** `docs/superpowers/specs/2026-05-28-golf-trip-planner-design.md`

---

## What to Keep (do not touch)

- `backend/api/auth.py` + `backend/services/auth.py`
- `backend/models/user.py`
- `backend/database.py`
- `backend/tests/conftest.py` (extend with new fixtures only)
- `frontend/src/store/auth.js`
- `frontend/src/pages/Login.jsx`, `Register.jsx`, `Dashboard.jsx`, `JoinPage.jsx`
- `frontend/src/api/client.js`
- Trip creation, invite, and join flow (`api/trips.py` routes: POST `/trips`, GET `/trips`, GET `/trips/{id}`, POST `/trips/{id}/invite`, POST `/trips/join/{token}`)

## What to Remove

- `backend/models/availability.py` (replaced by `availability_responses`)
- `backend/models/course.py` (CourseCache, TripCourseVote — replaced)
- `backend/services/availability.py` (replaced)
- `backend/schemas/availability.py` (replaced)
- `backend/api/courses.py` (replaced)
- `frontend/src/pages/TripPage.jsx` (replaced by TripRoom)
- `frontend/src/pages/LocationStep.jsx`, `CoursesStep.jsx`, `StartPage.jsx`
- `frontend/src/components/StepNav.jsx`

## File Map

### Backend — New Files

| File | Responsibility |
|---|---|
| `backend/models/phase.py` | `TripPhase` ORM model |
| `backend/models/availability.py` (rewrite) | `AvailabilityResponse` (date_ranges JSONB + budget) |
| `backend/models/destination.py` | `DestinationSuggestion` |
| `backend/models/round.py` | `TripRound`, `CourseNomination`, `CourseVote` |
| `backend/models/lodging.py` | `LodgingOption`, `LodgingVote` |
| `backend/models/decision.py` | `TripDecision` |
| `backend/models/email_queue.py` | `EmailQueue` |
| `backend/services/phases.py` | Phase transition logic, guards |
| `backend/services/claude.py` | Anthropic API client — destinations, courses, lodging |
| `backend/services/cost.py` | Running per-person cost estimate |
| `backend/services/email.py` | Enqueue email, background worker |
| `backend/api/phases.py` | `POST /trips/{id}/phases/{phase}/lock`, `POST /trips/{id}/phases/{phase}/reopen` |
| `backend/api/availability.py` | `POST /trips/{id}/availability`, `GET /trips/{id}/availability`, `POST /trips/{id}/nudge` |
| `backend/api/destinations.py` | `POST /trips/{id}/destinations/generate`, `POST /trips/{id}/destinations/{did}/vote`, `POST /trips/{id}/destinations/{did}/lock` |
| `backend/api/rounds.py` | Round setup, Claude suggestions, nominations, votes, lock |
| `backend/api/lodging.py` | Lodging type setup, Claude suggestions, nominations, votes, lock |
| `backend/api/share.py` | `GET /share/{trip_id}` — public, no auth |
| `backend/schemas/phase.py` | Pydantic schemas for phases |
| `backend/schemas/availability.py` (rewrite) | AvailabilityIn, AvailabilityOut, OverlapOut, BudgetVoteIn |
| `backend/schemas/destination.py` | DestinationSuggestionOut, VoteIn |
| `backend/schemas/round.py` | RoundSetupIn, CourseNominationOut, VoteIn |
| `backend/schemas/lodging.py` | LodgingSetupIn, LodgingOptionOut, VoteIn |
| `backend/schemas/decision.py` | TripDecisionOut |

### Backend — Modified Files

| File | Change |
|---|---|
| `backend/main.py` | Register all new routers, remove old, add lifespan for email worker |
| `backend/models/trip.py` | Remove location columns (destination_city/state/lat/lng/radius_miles), add phase init on create |
| `backend/schemas/trip.py` | Add `current_phase` and `phases` to TripOut |
| `backend/api/trips.py` | Initialize TripPhase rows on trip creation |

### Frontend — New Files

| File | Responsibility |
|---|---|
| `frontend/src/store/trip.js` | Zustand store: trip state, phases, members, cost estimate |
| `frontend/src/pages/TripRoom.jsx` | Trip Room container — loads trip, routes to current phase |
| `frontend/src/pages/SharePage.jsx` | Public shareable trip summary (no login required) |
| `frontend/src/components/MemberPanel.jsx` | Who's responded panel (always-on sidebar) |
| `frontend/src/components/CostEstimate.jsx` | Running per-person cost (always-on) |
| `frontend/src/components/ActivityLog.jsx` | Decision history |
| `frontend/src/phases/availability/AvailabilityPhase.jsx` | Phase 1 container |
| `frontend/src/phases/availability/DateRangePicker.jsx` | Calendar date range input |
| `frontend/src/phases/availability/BudgetVoteForm.jsx` | Happy spend + hard limit inputs |
| `frontend/src/phases/availability/OverlapHeatmap.jsx` | Date grid colored by response count |
| `frontend/src/phases/destination/DestinationPhase.jsx` | Phase 2 container |
| `frontend/src/phases/destination/GenerateForm.jsx` | Skill mix, budget tier, country inputs |
| `frontend/src/phases/destination/DestinationCard.jsx` | Single destination with voting |
| `frontend/src/phases/planning/PlanningPhase.jsx` | Phase 3 container (courses + lodging tabs) |
| `frontend/src/phases/planning/RoundsSetup.jsx` | How many rounds + tier per round |
| `frontend/src/phases/planning/RoundVoting.jsx` | One round's course options with voting |
| `frontend/src/phases/planning/LodgingVoting.jsx` | Lodging type toggle + options with voting |
| `frontend/src/phases/lockin/LockInPhase.jsx` | Phase 4 container — checklist + lock button |
| `frontend/src/phases/lockin/HypeMoment.jsx` | "We're Going!" full-screen moment |
| `frontend/src/api/phases.js` | API calls for phase transitions |
| `frontend/src/api/availability.js` | API calls for availability + budget |
| `frontend/src/api/destinations.js` | API calls for destinations |
| `frontend/src/api/rounds.js` | API calls for rounds + courses |
| `frontend/src/api/lodging.js` | API calls for lodging |

### Frontend — Modified Files

| File | Change |
|---|---|
| `frontend/src/App.jsx` | Replace `/trips/:id` → `TripRoom`, add `/share/:id` → `SharePage` |

---

## Milestone 1 — Foundation + Phase 1 (Availability)

> **Done when:** A group can create a trip, invite members, submit availability with budget votes, organizer sees overlap heatmap and nudges non-responders, organizer locks dates.

### Task 1: DB Cleanup

- [ ] Drop old tables and columns from the running DB:
  ```sql
  DROP TABLE IF EXISTS trip_course_votes CASCADE;
  DROP TABLE IF EXISTS course_cache CASCADE;
  DROP TABLE IF EXISTS availability CASCADE;
  ALTER TABLE trips DROP COLUMN IF EXISTS destination_city;
  ALTER TABLE trips DROP COLUMN IF EXISTS destination_state;
  ALTER TABLE trips DROP COLUMN IF EXISTS lat;
  ALTER TABLE trips DROP COLUMN IF EXISTS lng;
  ALTER TABLE trips DROP COLUMN IF EXISTS radius_miles;
  ```
  Run via: `psql -U postgres -d golf_trip_planner -c "<sql>"`
- [ ] Delete removed Python files: `models/course.py`, `api/courses.py`, `services/availability.py`, `schemas/availability.py` (old)
- [ ] Remove their imports from `main.py`
- [ ] Run existing tests to confirm nothing broke: `cd backend && .venv/Scripts/pytest tests/ -v`

### Task 2: New Backend Models

**`backend/models/phase.py`**
- `TripPhase`: `id`, `trip_id FK→trips`, `phase ENUM('availability','destination','planning','locked_in')`, `status ENUM('pending','open','locked')`, `locked_at TIMESTAMP nullable`, `locked_by INT FK→users nullable`

**`backend/models/availability.py`** (rewrite)
- `AvailabilityResponse`: `id`, `trip_id FK→trips`, `user_id FK→users`, `date_ranges JSONB` (list of `{start, end}` strings), `happy_spend NUMERIC nullable`, `hard_limit NUMERIC nullable`, `submitted_at TIMESTAMP`
- Unique constraint: `(trip_id, user_id)`

**`backend/models/decision.py`**
- `TripDecision`: `id`, `trip_id FK→trips`, `decision_type ENUM('date_locked','destination_locked','round_locked','lodging_locked','trip_locked')`, `entity_id INT nullable`, `entity_type VARCHAR nullable`, `decided_by INT FK→users`, `decided_at TIMESTAMP`, `override BOOLEAN default false`, `notes TEXT nullable`

**`backend/models/email_queue.py`**
- `EmailQueue`: `id`, `trip_id FK→trips`, `recipient_user_id FK→users`, `template VARCHAR`, `payload JSONB`, `status ENUM('pending','sent','failed')`, `send_after TIMESTAMP`, `attempts INT default 0`, `created_at TIMESTAMP`

- [ ] Write all four models
- [ ] Import them all in `main.py` so `Base.metadata.create_all()` picks them up
- [ ] Restart backend, verify tables created: `psql -U postgres -d golf_trip_planner -c "\dt"`
- [ ] Run tests: `pytest tests/ -v`

### Task 3: Phase State Machine Service

**`backend/services/phases.py`**

Functions to write:
- `get_phases(trip_id, db) -> list[TripPhase]` — returns all 4 phase rows
- `get_phase(trip_id, phase_name, db) -> TripPhase`
- `initialize_phases(trip_id, db)` — creates 4 rows: availability=open, others=pending
- `lock_phase(trip_id, phase_name, user_id, db, entity_id=None, entity_type=None, override=False)` — validates current user is organizer, status is open, transitions to locked, creates TripDecision row, sets next phase to open
- `reopen_phase(trip_id, phase_name, user_id, db)` — only allowed if next phase has not been acted upon (no rows in downstream tables)
- Valid re-open: `availability` if destination has no suggestions yet; `destination` if planning phase has no rounds set up

- [ ] Write `services/phases.py` with all five functions
- [ ] Write `backend/tests/test_phases.py`:
  - `test_initialize_phases_creates_four_rows`
  - `test_lock_availability_opens_destination`
  - `test_non_organizer_cannot_lock_phase`
  - `test_cannot_lock_already_locked_phase`
  - `test_reopen_availability_when_no_suggestions_exist`
- [ ] Run tests: `pytest tests/test_phases.py -v`

### Task 4: Phase API + Availability API

**`backend/api/phases.py`**
- `POST /trips/{trip_id}/phases/{phase}/lock` — calls `lock_phase()`; body: optional `{ entity_id, override }`
- `POST /trips/{trip_id}/phases/{phase}/reopen` — calls `reopen_phase()`
- `GET /trips/{trip_id}/phases` — returns all phase statuses

**`backend/api/availability.py`**
- `POST /trips/{trip_id}/availability` — upsert AvailabilityResponse for current user (date_ranges + budget)
- `GET /trips/{trip_id}/availability` — returns all members' date ranges (organizer only sees budget aggregate: median happy_spend, median hard_limit, range); members see only own budget
- `GET /trips/{trip_id}/availability/overlap` — returns `{days: [{date, count}], total_members}` (keep existing compute_overlap logic, rewrite to use new model)
- `POST /trips/{trip_id}/nudge` — enqueues reminder emails for all non-responded members

**`backend/schemas/availability.py`**
- `DateRange`: `start: date`, `end: date`  
- `AvailabilityIn`: `date_ranges: list[DateRange]`, `happy_spend: float | None`, `hard_limit: float | None`
- `BudgetAggregate`: `median_happy: float | None`, `median_hard: float | None`, `min_hard: float | None`, `max_hard: float | None`, `responded_count: int`
- `OverlapDay`: `date: date`, `count: int`
- `OverlapOut`: `days: list[OverlapDay]`, `total_members: int`

- [ ] Write schemas, then API files
- [ ] Update `api/trips.py`: call `initialize_phases(trip.id, db)` after creating trip
- [ ] Update `main.py`: register `phases_router` at `/trips`, `availability_router` at `/trips`
- [ ] Write `backend/tests/test_availability.py` (rewrite):
  - `test_submit_availability_upserts`
  - `test_organizer_sees_budget_aggregate`
  - `test_member_sees_own_budget_only`
  - `test_overlap_counts_correctly`
  - `test_nudge_queues_emails_for_non_responders`
- [ ] Run tests: `pytest tests/ -v`
- [ ] Commit: `feat: milestone 1 backend — phase state machine + availability API`

### Task 5: Frontend — Trip Room Shell + Zustand Store

**`frontend/src/store/trip.js`**
Zustand store fields: `trip`, `phases`, `currentPhase`, `loading`, `error`  
Actions: `loadTrip(id)`, `refreshPhases()`, `lockPhase(phase)`, `reopenPhase(phase)`

**`frontend/src/pages/TripRoom.jsx`**
- Loads trip + phases on mount
- Shows always-on header: trip name, member count, `CostEstimate`, back button
- Shows always-on right sidebar: `MemberPanel`
- Shows always-on bottom strip: `ActivityLog` (collapsible)
- Routes main content to current open phase component via `PhaseGate`
- `PhaseGate`: renders `<AvailabilityPhase>`, `<DestinationPhase>`, `<PlanningPhase>`, or `<LockInPhase>` based on which phase is `open`; pending phases shown as locked badges; locked phases shown as completed badges

**`frontend/src/components/MemberPanel.jsx`**
- Shows each trip member with a ✅ (responded to current phase action) or ⏳ (not yet)
- Shows organizer nudge button (organizer only): calls `POST /trips/{id}/nudge`

**`frontend/src/components/CostEstimate.jsx`**
- Calls `GET /trips/{id}/cost` (added in Milestone 3)
- Shows `~$X–$Y/person` range until lodging locked, then tighter number
- Shows placeholder "Cost estimate available after Phase 2" until destinations are locked

**`frontend/src/api/phases.js`**
- `lockPhase(tripId, phase, body?)`, `reopenPhase(tripId, phase)`, `getPhases(tripId)`

- [ ] Update `App.jsx`: import `TripRoom` for `/trips/:id`, add `/share/:id` route (placeholder for now)
- [ ] Write `store/trip.js`, `TripRoom.jsx`, `MemberPanel.jsx`, `CostEstimate.jsx` (placeholder), `api/phases.js`
- [ ] Start frontend: `cd frontend && npm run dev -- --port 5176`
- [ ] Verify: create a trip on Dashboard, navigate to it, see Trip Room shell with phase badges and member sidebar
- [ ] Commit: `feat: trip room shell + phase routing`

### Task 6: Phase 1 Frontend (Availability + Budget + Heatmap)

**`frontend/src/phases/availability/AvailabilityPhase.jsx`**
- Renders `DateRangePicker` + `BudgetVoteForm` side by side for members
- Organizer additionally sees `OverlapHeatmap` and a "Lock These Dates" button
- Lock button calls `lockPhase('availability')` → triggers TripRoom to re-render with Phase 2 open

**`frontend/src/phases/availability/DateRangePicker.jsx`**
- Multi-range date picker: user can add multiple `{start, end}` date ranges
- Simple approach: two `<input type="date">` fields + "Add Range" button, list of added ranges with remove button
- On submit: calls `POST /trips/{id}/availability` with date_ranges array + budget values

**`frontend/src/phases/availability/BudgetVoteForm.jsx`**
- Two currency inputs: "What would you happily spend?" + "What's your hard limit?"
- Submitted together with availability (same POST body)
- Silent: "Only the organizer sees the budget summary"

**`frontend/src/phases/availability/OverlapHeatmap.jsx`**
- Fetches `GET /trips/{id}/availability/overlap`
- Renders a month-grid calendar where each day cell is colored by count (0 = white, total_members = dark green)
- Shows "X of Y members available" tooltip on hover
- Organizer also sees budget aggregate: "Group budget: $X–$Y / person (median: $Z)"

**`frontend/src/api/availability.js`**
- `submitAvailability(tripId, dateRanges, happySpend, hardLimit)`
- `getOverlap(tripId)`
- `getAvailability(tripId)`
- `nudgeMembers(tripId)`

- [ ] Write all four files + `api/availability.js`
- [ ] Verify in browser: submit availability as member, see heatmap update, see member panel update
- [ ] Verify: organizer sees budget aggregate, members do not
- [ ] Verify: organizer can lock Phase 1, Phase 2 badge becomes active
- [ ] Commit: `feat: phase 1 availability frontend`

---

### 🔍 Milestone 1 Crew Review

Before proceeding to Milestone 2, spawn these subagents in parallel and incorporate their feedback:
- **Trip Planner** — does the availability flow match real-world group trip planning?
- **UI Designer** — is the Trip Room shell intuitive? Is Phase 1 frictionless enough?
- **Developer** — any API design or state management concerns?
- **High Handicap Golfer** — would you actually fill this out? Where would you bail?

---

## Milestone 2 — Phase 2: AI Destinations

> **Done when:** After dates are locked, organizer can generate AI destination suggestions, group votes, organizer locks a destination, Phase 3 opens.

### Task 7: Claude Service

- [ ] Add `anthropic>=0.25.0` to `backend/requirements.txt` and install: `.venv/Scripts/pip install anthropic`
- [ ] Add `ANTHROPIC_API_KEY=sk-ant-...` to `backend/.env`

**`backend/services/claude.py`**

Three functions:
1. `generate_destinations(dates, group_size, skill_mix, budget_median, budget_max, country, tier_filter) -> list[dict]`  
   - Calls Claude with a structured prompt, requests JSON array of 3 destinations
   - Each destination: `{name, region, why_it_fits, top_courses: [{name, rating, slope, est_green_fee, rating_source}], est_cost_per_person_rounds}`
   - Parse response JSON; raise `ValueError` if malformed

2. `generate_courses_for_round(destination, tier, round_number, existing_nominations) -> list[dict]`  
   - Returns 3–4 course options at the given tier near the destination
   - Each: `{name, location, rating, slope, par, yardage_options, green_fee, cart_fee, walking_policy, architect, pace_of_play, tee_time_window, rating_source}`

3. `generate_lodging(destination, lodging_type, group_size, nights, course_names) -> list[dict]`  
   - Returns 3–4 lodging options
   - Each: `{name, type, price_per_night, beds, capacity, distance_to_courses, booking_link}`

- [ ] Write `services/claude.py` — no tests needed for the Claude calls themselves (they call a live API); test the JSON parsing logic separately
- [ ] Write `backend/tests/test_claude_parsing.py`:
  - `test_parse_valid_destination_json`
  - `test_parse_invalid_json_raises_value_error`

### Task 8: Destination Model + API

**`backend/models/destination.py`**
- `DestinationSuggestion`: `id`, `trip_id FK→trips`, `generation_status ENUM('pending','complete','failed')`, `suggestions JSONB` (list of destination dicts), `locked_destination JSONB nullable`, `generated_at TIMESTAMP nullable`, `prompt_inputs JSONB` (what was sent to Claude)
- Unique constraint: `(trip_id)` — one suggestion set per trip

**`backend/api/destinations.py`**
- `POST /trips/{trip_id}/destinations/generate` — organizer only; checks phase is `destination/open`; creates/updates row with `status=pending`; calls `claude.generate_destinations()`; on success sets `status=complete`, `suggestions=result`; on failure sets `status=failed`; returns the suggestion row
- `GET /trips/{trip_id}/destinations` — returns suggestion row (served from DB, no re-call to Claude)
- `POST /trips/{trip_id}/destinations/vote` — body: `{destination_index: int, vote: "up"|"down"}`; stores in a simple `destination_votes` table (`trip_id`, `user_id`, `destination_index`, `vote`)
- `POST /trips/{trip_id}/destinations/lock` — organizer only; body: `{destination_index: int}`; sets `locked_destination`; calls `lock_phase('destination')`; records TripDecision

**`backend/models/destination.py`** also needs:
- `DestinationVote`: `id`, `trip_id`, `user_id`, `destination_index INT`, `vote ENUM('up','down')` — unique on `(trip_id, user_id)`

- [ ] Write model, schema, API
- [ ] Write `backend/tests/test_destinations.py`:
  - `test_generate_destinations_persists_to_db` (mock Claude call)
  - `test_generate_fails_gracefully_on_claude_error`
  - `test_vote_upserts`
  - `test_non_organizer_cannot_lock`
  - `test_lock_sets_locked_destination_and_advances_phase`
- [ ] Register router in `main.py`
- [ ] Run tests: `pytest tests/test_destinations.py -v`
- [ ] Commit: `feat: destination suggestions model + API`

### Task 9: Phase 2 Frontend

**`frontend/src/phases/destination/DestinationPhase.jsx`**
- If `generation_status == 'complete'`: render list of `DestinationCard`s
- If `generation_status == 'pending'`: loading spinner
- If `generation_status == 'failed'`: error + retry button
- If no suggestion row yet: render `GenerateForm` (organizer) or "Organizer is setting up destination suggestions" (members)
- Organizer: "Lock This Destination" button on chosen card

**`frontend/src/phases/destination/GenerateForm.jsx`**
- Skill mix: text input (free text, e.g. "mostly 15-20 handicap, one scratch player")
- Budget tier: radio buttons — "Show all (recommended)" / "Budget" / "Midrange" / "Luxury"
- Shows budget aggregate from Phase 1 as hint: "Group median: $X / person"
- Country: dropdown, defaults to "United States"
- "Generate Suggestions" button → POST, shows loading state

**`frontend/src/phases/destination/DestinationCard.jsx`**
- Destination name + region
- "Why it fits" paragraph
- Top courses list with rating, slope, est. green fee, rating source
- Est. cost/person (rounds only)
- ⚠️ availability warning
- 👍/👎 vote buttons (each member sees their own vote state)
- Vote tally (e.g. "4 👍 1 👎")
- Organizer: "Lock This Destination" button

**`frontend/src/api/destinations.js`**
- `generateDestinations(tripId, inputs)`, `getDestinations(tripId)`, `voteOnDestination(tripId, index, vote)`, `lockDestination(tripId, index)`

- [ ] Write all components + API module
- [ ] Verify in browser: organizer generates suggestions, all members see cards, voting works, organizer can lock
- [ ] Verify: after lock, Phase 3 badge becomes active in Trip Room
- [ ] Commit: `feat: phase 2 destination frontend`

---

### 🔍 Milestone 2 Crew Review

Spawn in parallel:
- **Low Handicap Golfer** — does the destination card have enough golf-specific info?
- **UI Designer** — is the generate → loading → cards flow clear?
- **Trip Planner** — does locking a destination feel decisive enough?
- **Developer** — any concerns about the Claude API error handling or DB persistence?

---

## Milestone 3 — Phase 3: Courses + Lodging

> **Done when:** Group can set up rounds with tiers, vote on courses per round, vote on lodging, and the running cost estimate updates live.

### Task 10: Round + Course Models

**`backend/models/round.py`**
- `TripRound`: `id`, `trip_id FK→trips`, `round_number INT`, `tier ENUM('premium','midrange','value')`, `locked_course_id INT nullable FK→course_nominations`, `generation_status ENUM('pending','complete','failed')`
- `CourseNomination`: `id`, `round_id FK→trip_rounds`, `trip_id FK→trips`, `course_data JSONB`, `nominated_by INT FK→users nullable` (null = AI-generated), `generation_status ENUM('ai','manual')`
- `CourseVote`: `id`, `nomination_id FK→course_nominations`, `user_id FK→users`, `vote ENUM('up','down')` — unique `(nomination_id, user_id)`

**`backend/api/rounds.py`**
- `POST /trips/{trip_id}/rounds/setup` — organizer only; body: `{rounds: [{round_number, tier}]}`; creates TripRound rows; triggers Claude generation for each round (async in background task)
- `GET /trips/{trip_id}/rounds` — returns all rounds with their nominations + vote counts + current user's vote
- `POST /trips/{trip_id}/rounds/{round_id}/generate-more` — generates a fresh set of suggestions, appends to existing nominations
- `POST /trips/{trip_id}/rounds/{round_id}/nominate` — body: `{course_data: {...}}` from manual search; creates CourseNomination with `generation_status='manual'`
- `POST /trips/{trip_id}/rounds/{round_id}/nominations/{nom_id}/vote` — upsert CourseVote
- `POST /trips/{trip_id}/rounds/{round_id}/lock` — body: `{nomination_id}`; sets `locked_course_id`; records TripDecision; if all rounds locked, check if Phase 4 can open

**Course search (manual add):** reuse existing Overpass API + add a `GET /trips/{trip_id}/courses/search?q={name}` endpoint that queries Overpass and returns course data in the same shape as `course_data` JSONB.

- [ ] Write models, API, schemas
- [ ] Write `tests/test_rounds.py`:
  - `test_setup_rounds_creates_correct_rows`
  - `test_nominate_course_enters_vote_pool`
  - `test_vote_upserts`
  - `test_organizer_can_lock_round`
  - `test_all_rounds_locked_checks_phase_4_readiness`
- [ ] Run tests: `pytest tests/test_rounds.py -v`
- [ ] Commit: `feat: rounds + course nomination model + API`

### Task 11: Lodging Model + API

**`backend/models/lodging.py`**
- `LodgingOption`: `id`, `trip_id FK→trips`, `lodging_type ENUM('rental','hotel','both')` (the preference set by organizer), `option_data JSONB`, `added_by INT FK→users nullable` (null = AI), `generation_status ENUM('pending','complete','failed')`
- `LodgingVote`: `id`, `option_id FK→lodging_options`, `user_id FK→users`, `vote ENUM('up','down')` — unique `(option_id, user_id)`
- `LodgingLock`: store as a column on `Trip` or a separate `locked_lodging_option_id` column on a trip settings table — simpler: add `locked_lodging_option_id INT nullable` to `Trip` model

**`backend/api/lodging.py`**
- `POST /trips/{trip_id}/lodging/setup` — organizer sets `{lodging_type: 'rental'|'hotel'|'both'}`; triggers Claude generation (background task)
- `GET /trips/{trip_id}/lodging` — returns type setting + all options + vote counts
- `POST /trips/{trip_id}/lodging/generate-more` — generates more suggestions
- `POST /trips/{trip_id}/lodging/nominate` — manual add; body: `{option_data: {...}}`
- `POST /trips/{trip_id}/lodging/options/{opt_id}/vote` — upsert LodgingVote
- `POST /trips/{trip_id}/lodging/options/{opt_id}/lock` — records TripDecision; checks phase 4 readiness

- [ ] Write models, API, schemas
- [ ] Write `tests/test_lodging.py`: setup, nominate, vote, lock
- [ ] Run tests: `pytest tests/test_lodging.py -v`
- [ ] Commit: `feat: lodging model + API`

### Task 12: Cost Estimate Service + Endpoint

**`backend/services/cost.py`**
`compute_cost_estimate(trip_id, db) -> dict`:
- Rounds estimate: for each `TripRound`, if `locked_course_id` set use that course's `green_fee`; else average green fees of all nominations for that round
- Lodging estimate: if locked lodging option exists, use `price_per_night × nights ÷ group_size`; else use average of lodging options
- Returns: `{rounds_estimate_low, rounds_estimate_high, lodging_per_person, total_low, total_high, nights, group_size, is_estimate: bool}`

**`backend/api/trips.py`** — add:
- `GET /trips/{trip_id}/cost` — calls `compute_cost_estimate()`; any member can call

- [ ] Write service + endpoint
- [ ] Write `tests/test_cost.py`:
  - `test_cost_estimate_rounds_only_before_lodging`
  - `test_cost_estimate_tightens_after_lodging_locked`
- [ ] Run tests
- [ ] Commit: `feat: running cost estimate service`

### Task 13: Phase 3 Frontend

**`frontend/src/phases/planning/PlanningPhase.jsx`**
- Two-tab layout: "Courses" + "Lodging"
- Shows running `CostEstimate` banner at top (now live)
- Phase 4 "Lock It In" button becomes enabled when all rounds + lodging are locked

**`frontend/src/phases/planning/RoundsSetup.jsx`** (organizer only, shown before rounds exist)
- "How many rounds?" number input (1–5)
- Per round: tier dropdown (Premium / Midrange / Value)
- "Set Up Rounds" button → POST setup, then hides and shows `RoundVoting`

**`frontend/src/phases/planning/RoundVoting.jsx`**
- One card per round (Round 1: Premium, etc.)
- Lists course nominations with course card details (name, rating, slope, yardage, green fee, cart policy, architect, pace of play, tee window, rating source)
- 👍/👎 per nomination
- Vote tallies
- "Add a Course" search box (manual nominate via Overpass search)
- "Suggest More" button
- Organizer: "Lock This Course" button on winner
- Locked courses shown with ✅

**`frontend/src/phases/planning/LodgingVoting.jsx`**
- If not set up: organizer sees type toggle (Rental House / Hotel / Show Both) + "Find Options" button
- Once set up: list of lodging option cards (name, type, price/night, beds, distance to courses, booking link)
- 👍/👎 + tallies
- "Add an Option" manual input
- Organizer: "Lock This Lodging" button

- [ ] Write all components + `api/rounds.js` + `api/lodging.js`
- [ ] Update `CostEstimate.jsx` to actually call `GET /trips/{id}/cost`
- [ ] Verify in browser: full Phase 3 flow — set up rounds, see AI suggestions, vote, manually add, lock each round, set up lodging, vote, lock
- [ ] Verify: cost estimate updates as rounds and lodging are locked
- [ ] Commit: `feat: phase 3 courses + lodging frontend`

---

### 🔍 Milestone 3 Crew Review

Spawn in parallel:
- **Low Handicap Golfer** — are the course cards rich enough? Any missing info?
- **High Handicap Golfer** — is the voting flow simple enough? Would you use it?
- **Trip Planner** — does round-by-round selection match how real groups pick courses?
- **UI Designer** — is the two-tab Courses/Lodging layout clear? Any confusion points?
- **Developer** — concerned about parallel Claude calls for multiple rounds? Background task approach OK?

---

## Milestone 4 — Phase 4: Lock It In + Email + Shareable Page

> **Done when:** Organizer locks the trip, all members get a hype moment + email, shareable page is live at `/share/:id`.

### Task 14: Phase 4 Backend + Email

**`backend/api/phases.py`** — add:
- `POST /trips/{trip_id}/lock` — organizer only; validates all rounds + lodging locked; sets trip `status='finalized'`; locks phase `locked_in`; records `TripDecision(type='trip_locked')`; enqueues summary emails for all members

**`backend/services/email.py`**
- `enqueue_email(db, trip_id, recipient_user_id, template, payload, send_after=None)` — inserts EmailQueue row
- `send_email(to_address, subject, body)` — uses `smtplib` with env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`
- `process_email_queue(db)` — queries `status='pending'` and `send_after <= now()`; calls `send_email()`; marks sent/failed; increments attempts; stops retrying at 3 attempts
- Background worker: `async def email_worker()` — `asyncio.sleep(60)` loop calling `process_email_queue()`

**`backend/main.py`** — add lifespan:
```python
from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(email_worker())
    yield
    task.cancel()
app = FastAPI(lifespan=lifespan)
```

**Auto-reminders** (add to `services/email.py`):
- `check_and_enqueue_reminders(db)` — for each open availability phase trip, find non-responders; if last reminder was >3 days ago (or never), enqueue reminder email; called inside `email_worker()` loop

Email templates (plain text, assembled in `services/email.py`):
- `availability_reminder` — "Hey {name}, {organizer} needs your availability for {trip_name}. Visit: {url}"
- `trip_summary` — "You're going! {trip_name} · {dates} · {destination} · Courses: {courses} · Lodging: {lodging}"

- [ ] Write `services/email.py`, update `api/phases.py`, update `main.py` lifespan
- [ ] Add SMTP env vars to `backend/.env` (can use placeholder values for dev)
- [ ] Write `tests/test_email.py`:
  - `test_enqueue_email_creates_row`
  - `test_process_queue_marks_sent` (mock smtplib)
  - `test_process_queue_retries_on_failure`
  - `test_reminder_not_enqueued_if_already_responded`
- [ ] Run tests: `pytest tests/test_email.py -v`
- [ ] Commit: `feat: phase 4 backend + email queue worker`

### Task 15: Shareable Page Backend

**`backend/api/share.py`** — no auth required:
- `GET /share/{trip_id}` — returns trip summary if status is `finalized`; 404 if not finalized or not found
- Returns: trip name, destination name, dates (from locked TripDecision), who's going (member names), courses by round (locked course data), lodging (locked option data)

- [ ] Write API, register in `main.py` at `/share` prefix (no auth middleware)
- [ ] Write `tests/test_share.py`:
  - `test_share_returns_404_when_not_finalized`
  - `test_share_returns_summary_when_finalized`
  - `test_share_requires_no_auth`
- [ ] Run tests
- [ ] Commit: `feat: public shareable trip page API`

### Task 16: Phase 4 + Share Frontend

**`frontend/src/phases/lockin/LockInPhase.jsx`**
- Checklist: dates ✅, destination ✅, each round ✅, lodging ✅
- If all checked: "We're Going!" button (primary, big)
- If not all checked: list which items still need locking, button disabled
- On lock: POST `/trips/{id}/lock`, then show `HypeMoment`

**`frontend/src/phases/lockin/HypeMoment.jsx`**
- Full-screen overlay: destination name, dates, "🎉 We're Going!"
- Member names list
- "Share the Trip" button → opens `/share/:id` in new tab
- "Next Steps" section (separate card below overlay): "Book your tee times ASAP" + direct link for each course

**`frontend/src/pages/SharePage.jsx`**
- No auth required (public route in `App.jsx`)
- Fetches `GET /share/{tripId}`
- Shows: trip name, destination, dates, who's going, courses by round (with course details), lodging
- Styled for screenshot — clean, big text, designed to look good in a group chat preview
- If not finalized: "This trip isn't locked in yet."

- [ ] Write `LockInPhase.jsx`, `HypeMoment.jsx`, `SharePage.jsx`
- [ ] Update `App.jsx`: add `<Route path="/share/:id" element={<SharePage />} />`
- [ ] Verify in browser: full flow from Phase 4 checklist → lock → hype moment → share page renders correctly without login
- [ ] Commit: `feat: phase 4 frontend + shareable trip page`

---

### 🔍 Final Crew Review

Spawn in parallel — full end-to-end review:
- **Trip Planner** — walk the full flow. Anything that would stop a real trip from getting planned?
- **High Handicap Golfer** — would you actually use this? Where did it feel like too much work?
- **Low Handicap Golfer** — course info sufficient? Trust the AI suggestions?
- **UI Designer** — end-to-end UX: any confusing moments, missing feedback, wrong tone?
- **Developer** — production concerns: email worker robustness, Claude API cost/rate limits, anything that needs hardening before real users?
- **Group Organizer** — does the app give you leverage, or is it still you doing all the work?

After incorporating final crew feedback, run full test suite: `pytest tests/ -v`

---

## Environment Variables Required

Add to `backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/golf_trip_planner
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/golf_trip_planner_test
SECRET_KEY=dev-secret-key-change-in-production
ANTHROPIC_API_KEY=sk-ant-...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=Golf Trip Planner <noreply@golftrip.app>
```

## Running the Stack

```bash
# Backend
cd backend && .venv/Scripts/uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev -- --port 5176

# Tests
cd backend && .venv/Scripts/pytest tests/ -v
```
