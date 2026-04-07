# Handoff Notes for Michael

**Date:** 2026-04-07  
**Branch:** `feature/plan1-foundation`  
**Picked up by:** Dan + Claude (claude-sonnet-4-6)

---

## What This Project Is

A collaborative golf trip planning web app. A group organizer creates a trip, invites friends, each member submits their availability, and the app recommends the best trip dates based on group availability + weather patterns + course preferences.

**Full design spec:** `docs/superpowers/specs/2026-04-07-golf-trip-planner-design.md`  
**Full implementation plan (Plan 1):** `docs/superpowers/plans/2026-04-07-foundation-availability.md`

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.14, FastAPI 0.135.3, SQLAlchemy 2.0.49 |
| Database | PostgreSQL (running locally on port 5432) |
| Auth | JWT via python-jose, bcrypt via passlib |
| Frontend | React 18, Vite, Zustand, Axios, React Router 6 (not started yet) |
| Course data | OpenStreetMap/Overpass API (free, no key) |
| Reviews/lodging | Google Places API (free tier — needs API key in .env) |
| Weather | Open-Meteo (free, no key) |

---

## What's Done (Tasks 1–4 of 11)

### ✅ Task 1 — Project Scaffold
- `docker-compose.yml` — two Postgres 15 services: `db` (port 5432) and `db_test` (port 5433)
- `.env.example` — template with DATABASE_URL, TEST_DATABASE_URL, SECRET_KEY, GOOGLE_PLACES_API_KEY
- `README.md` — quick start guide

### ✅ Task 2 — Backend Foundation
- `backend/requirements.txt` — all dependencies pinned
- `backend/database.py` — SQLAlchemy engine, SessionLocal, Base, get_db()
- `backend/main.py` — FastAPI app with CORS for localhost:5173
- Empty `__init__.py` files in api/, models/, schemas/, services/, tests/
- `backend/pytest.ini`

### ✅ Task 3 — User Model & Auth Service
- `backend/models/user.py` — User table (id, email, name, hashed_password, created_at)
- `backend/schemas/user.py` — UserCreate, UserOut, Token (Pydantic v2)
- `backend/services/auth.py` — hash_password, verify_password, create_access_token, get_user_from_token

### ✅ Task 4 — Auth API Endpoints & Tests
- `backend/api/auth.py` — POST /auth/register, POST /auth/login, GET /auth/me
- `backend/tests/conftest.py` — pytest fixtures (client, auth_client, test DB setup/teardown)
- `backend/tests/test_auth.py` — 6 tests, all passing ✅
- `backend/main.py` — updated to register auth router
- **Stub files** created for models/trip.py and models/availability.py (just `from database import Base`) — these will be replaced in Tasks 5 and 6

---

## What's Left (Tasks 5–11)

### Task 5 — Trip Model & CRUD API
Files to create:
- `backend/models/trip.py` — Trip (id, name, organizer_id, status, created_at) + TripMember (id, trip_id, user_id, invite_token, invite_email, joined, joined_at)
- `backend/schemas/trip.py` — TripCreate, TripOut, TripMemberOut, InviteCreate, InviteOut
- `backend/api/trips.py` — POST /trips, GET /trips, GET /trips/{id}, POST /trips/{id}/invite, POST /trips/join/{token}
- `backend/tests/test_trips.py` — 4 tests

Full code for all files is in the plan doc: `docs/superpowers/plans/2026-04-07-foundation-availability.md` — search for "## Task 5"

### Task 6 — Availability Model, Service & API
Files to create:
- `backend/models/availability.py` — Availability (id, trip_id, user_id, start_date, end_date)
- `backend/schemas/availability.py` — DateRange, AvailabilityCreate, OverlapDay, OverlapOut
- `backend/services/availability.py` — compute_overlap(trip_id, db) function
- `backend/tests/test_availability.py` — 4 tests
- Modify `backend/api/trips.py` — add POST /{trip_id}/availability and GET /{trip_id}/availability/overlap

Full code in plan doc — search for "## Task 6"

### Task 7 — Frontend Scaffold
- Vite + React app in `frontend/`
- Dark theme CSS (navy/slate dark, green accents)
- Zustand auth store, Axios client with JWT interceptor
- React Router setup

Full code in plan doc — search for "## Task 7"

### Task 8 — Auth UI (Login & Register pages)
### Task 9 — Trip Dashboard (list + create trip)
### Task 10 — Availability Step UI (calendar heatmap + member sidebar + invite flow)
### Task 11 — Push everything to GitHub

Full code for Tasks 8–11 in the plan doc.

---

## Environment Notes (Important)

- **Python version:** 3.14.3 — some packages had to be bumped from the plan's pinned versions:
  - `psycopg2-binary` → 2.9.11 (no 3.14 wheel for 2.9.9)
  - `fastapi` → 0.135.3 (0.110.0 requires pydantic < 2.7)
  - `pydantic[email]` → 2.12.5
  - `sqlalchemy` → 2.0.49
  - `bcrypt` → 4.0.1 (passlib 1.7.4 incompatible with bcrypt 5.x)
  - All other packages at spec versions

- **Docker:** Not available on Dan's machine — PostgreSQL running locally on port 5432. Both dev and test DB are on the same server, different database names (`golf_trip_planner` and `golf_trip_planner_test`). The `db_test` docker-compose service (port 5433) was NOT used — both URLs point to localhost:5432.

- **backend/.env:** Created locally (gitignored). You need to create your own:
  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/golf_trip_planner
  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/golf_trip_planner_test
  SECRET_KEY=any-random-string
  GOOGLE_PLACES_API_KEY=not-needed-until-plan-2
  ```

- **python-jose CVE:** The `python-jose` package used for JWT has known CVEs. Acceptable for dev, but consider switching to `PyJWT` before any production deployment.

---

## How to Run Tests

```bash
cd backend
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pytest -v
```

Expected output: 6 tests passing (all in test_auth.py)

---

## How to Resume with Claude

Tell Claude: *"I'm Michael, picking up the golf trip planner from Dan. Read HANDOFF.md and the plan at docs/superpowers/plans/2026-04-07-foundation-availability.md. We're on branch feature/plan1-foundation. Resume from Task 5 using subagent-driven-development."*

---

## Plan Overview (All 3 Plans)

- **Plan 1** (this branch): Foundation + Group Availability — full working Step 1 of the wizard
- **Plan 2** (future): Course Discovery & Map — Overpass API, Google Places, Leaflet map, filters, voting
- **Plan 3** (future): Recommendation Engine — Open-Meteo weather, scoring algorithm, top-3 date recommendations

The app has a 4-step wizard:
1. **Availability** — group submits available dates → heatmap shows overlap
2. **Location** — pick state/city + radius → map loads with regional weather badge
3. **Courses** — filter/browse/vote on courses on interactive map
4. **Recommend** — top 3 trip dates scored by availability + weather + course votes
