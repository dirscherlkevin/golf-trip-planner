# Golf Trip Planner — Handoff Notes

**Last updated:** 2026-05-29 (session 2)  
**Branch:** `main`  
**Status:** Full 4-phase Trip Room implemented, 55/55 tests passing

---

## What This Is

A collaborative golf trip planning web app. An organizer creates a trip, invites friends, and the group works through 4 sequential phases to finalize plans:

1. **Availability** — Members submit available date ranges + budget. Organizer picks and locks trip dates.
2. **AI Destinations** — Organizer generates AI-suggested destinations via Claude. Members vote. Organizer locks one.
3. **Courses + Lodging** — Organizer sets up rounds (with AI course suggestions). Members vote on courses and lodging. Organizer locks each.
4. **Lock It In** — Organizer finalizes the trip. All members get a summary email. A public shareable page is generated.

**Design spec:** `docs/superpowers/specs/2026-05-28-golf-trip-planner-design.md`  
**Implementation plan:** `docs/superpowers/plans/2026-05-28-trip-room-rebuild.md`

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 |
| Database | PostgreSQL 15 (dev: port 5432, test: port 5433) |
| Auth | JWT via python-jose, bcrypt via passlib |
| AI | Anthropic claude-opus-4-7 — destinations, courses, lodging |
| Frontend | React 18, Vite 8, Zustand, Axios, React Router 6 |
| Email | SMTP queue with asyncio worker (asyncio.create_task in FastAPI lifespan) |

---

## How to Run

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # then fill in ANTHROPIC_API_KEY etc.
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # proxies /auth /trips /share to localhost:8000
```

### Database

```bash
docker compose up -d db db_test
```

Or run PostgreSQL locally — the connection strings are in `.env`.

### Tests

```bash
cd backend
.venv/Scripts/python.exe -m pytest -v
# Expected: 55 passed
```

---

## Environment Variables (see `backend/.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `APP_BASE_URL` | Base URL for invite links + email trip URLs | `http://localhost:5173` |
| `DATABASE_URL` | Main database | postgres://... |
| `TEST_DATABASE_URL` | Test database (port 5433) | postgres://... |
| `SECRET_KEY` | JWT signing key | *change before deploying* |
| `ANTHROPIC_API_KEY` | Claude API — required for AI features | — |
| `SMTP_HOST/PORT/USER/PASSWORD` | Email sending — leave blank to skip | — |
| `EMAIL_FROM` | Sender address | `noreply@golftrip.app` |

---

## Project Structure

```
backend/
  api/           # FastAPI routers (one file per feature domain)
    auth.py        register, login, /me
    trips.py       CRUD + invite + join + cost estimate
    phases.py      get/lock/reopen phases + POST /trips/{id}/lock (finalize)
    availability.py  submit, get, overlap heatmap, nudge
    destinations.py  generate (Claude), get, vote, lock
    rounds.py      setup, get, generate-more, nominate, vote, lock
    lodging.py     setup, get, generate-more, nominate, vote, lock
    share.py       public GET /share/{id} — no auth required
  models/        # SQLAlchemy ORM models
  schemas/       # Pydantic request/response models
  services/
    phases.py      phase state machine (lock, reopen, initialize)
    claude.py      all Anthropic API calls (with retry/backoff)
    email.py       queue + worker + reminder logic
    cost.py        per-person cost estimate (rounds + lodging)
  tests/         # 55 tests across all features

frontend/
  src/
    api/           # axios wrappers per domain
    store/         # Zustand stores (auth, trip)
    pages/         # TripRoom, Dashboard, Login, Register, JoinPage, SharePage
    phases/        # Phase components (availability/, destination/, planning/, lockin/)
    components/    # MemberPanel (w/ invite), CostEstimate
```

---

## Key Architecture Decisions

### Phase State Machine
- 4 phases per trip: `availability → destination → planning → locked_in`
- Each phase: `pending → open → locked`
- Locking a phase opens the next one
- Reopen supported for availability, destination, planning (not after finalization)
- `POST /trips/{id}/lock` finalizes the trip, locks locked_in, sets `trip.status = finalized`

### AI Generation
- Destinations: synchronous (users wait ~20-30s; generation_status handles failure)
- Courses + Lodging: background tasks (FastAPI `BackgroundTasks` + own DB session)
- All Claude calls use exponential backoff (2s → 4s → 8s → fail) on rate limits/timeouts/500s
- Stuck pending rows auto-reset after 3 minutes (detected via `_started_at` in prompt_inputs JSONB)

### Email Queue
- `email_queue` table with status (`pending/sent/failed`), attempts, send_after
- `email_worker()` asyncio task runs every 60s, processes up to 10 rows
- Uses `SELECT FOR UPDATE SKIP LOCKED` — safe for multiple worker processes
- Templates: `availability_reminder`, `trip_summary`
- Display names derived from email local part ("john.doe@" → "John Doe")

### Public Share Page
- `GET /share/{trip_id}` — no auth, 404 unless `trip.status == finalized`
- Returns display names (not raw emails), formatted dates, courses, lodging
- OG meta tags set dynamically for link previews in iMessage/Slack/Discord

### Polling
- TripRoom polls phases every 15s (all members see phase transitions)
- PlanningPhase polls rounds every 10s while any generation is pending
- LockInPhase polls every 10s for non-organizer (detects finalization via `GET /trips/{id}`)
- DestinationPhase polls every 15s while generation is pending

---

## Known Gaps / Future Work

| Item | Priority | Notes |
|---|---|---|
| Email dedup UNIQUE constraint | Medium | Can't use simple `UNIQUE(trip_id, user_id, template)` — breaks availability reminders that recur. Idempotency guard on lock endpoint already prevents double trip_summary. |
| Display names are email-derived | Low | No name field on User model; display names come from email local part |
| Share page privacy | Low | Display names shown (not emails), but names are still guessable from email |
| Real SMTP setup | Low | Email sends fail in dev (no SMTP configured); emails still queue in DB |
| `locked_in` phase cannot be reopened | By design | Finalizing sends emails — no un-finalize |
| No CORS restriction | Low | `allow_origins=["*"]` in main.py — tighten for production (JWT + credentials=False makes this safe for now) |

---

## How to Resume with Claude

Tell Claude: *"Read HANDOFF.md and pick up the golf trip planner. Current state: 55/55 tests, full 4-phase Trip Room working on main branch. Look at the Known Gaps section for next priorities."*
