# Golf Trip Planner — Design Spec
**Date:** 2026-05-28  
**Status:** Approved

---

## Problem Statement

Friend groups planning annual or semi-annual golf trips default to group text chaos. Someone eventually gets frustrated and just plans the whole thing themselves. The app exists to give the organizer better tools earlier and make participation effortless for everyone else — so the trip actually happens, with group buy-in, without one person doing all the work.

**Primary use case:** Big annual or semi-annual golf trip, 4–8 tech-savvy adults.  
**Secondary:** Smaller outings if the flow fits — not the design target.  
**Current pain:** Group text → decision paralysis → one person takes over.

---

## Architecture: Trip Room with 4 Gated Phases

The app is structured as a **Trip Room** — a shared space where all trip state lives. Phases gate in sequence; each unlocks after the previous is completed. Within a phase everything is visible to all members. The organizer controls progression; members participate and vote.

```
Phase 1: Availability  →  Phase 2: Destination  →  Phase 3: Courses + Lodging  →  Phase 4: Lock It In
(gates all)                (AI-powered)               (parallel tracks)              (the moment)
```

### Phase State Machine

Every phase has an explicit status. No implicit transitions — every state change is triggered by organizer action and recorded.

| Status | Meaning |
|---|---|
| `pending` | Phase not yet reachable (prior phase not locked) |
| `open` | Active — members can submit responses/votes |
| `locked` | Organizer has locked this phase; inputs frozen |

**Valid transitions:** `pending → open` (when prior phase locks), `open → locked` (organizer action only).

**Re-opening:** Organizer may re-open Phase 1 or Phase 2 only if Phase 3 has not yet started (i.e., no round setup or lodging type selected). Once Phase 3 is underway, dates and destination are frozen.

**`trip_phases` table:** one row per phase per trip. Columns: `phase ENUM(availability, destination, planning, locked_in)`, `status ENUM(pending, open, locked)`, `locked_at TIMESTAMP`, `locked_by INTEGER (user FK)`.

### Voting Model (applies to all phases)

- **Mechanism:** Thumbs up / thumbs down (👍/👎). Each member casts one vote per option. No ranked choice.
- **Winner:** Plurality — option with most net upvotes wins.
- **Tie:** Organizer has explicit override authority. Override is recorded in `trip_decisions` with `override_by` set.
- **Organizer locks any option** regardless of vote totals — override is always available.

---

## Phase 1 — Availability (Gates Everything)

**Availability is king.** Nothing else opens until the organizer locks dates.

### Members do:
- Mark available date ranges on an interactive calendar
- Submit a **silent budget vote** — two numbers:
  - "What would you happily spend?" (soft target)
  - "What's your hard limit?" (ceiling)
  - Members see only their own inputs; organizer sees the aggregate of whoever has responded so far
- View the public **"Who's responded / who hasn't"** panel — visible to all members, not just the organizer. Social peer pressure helps drive responses.

### Organizer sees:
- Overlap heatmap — best date windows highlighted automatically
- Budget aggregate: median happy-spend, median hard limit, full range (computed from responded members only)
- Group size auto-populated from respondents (no manual counting)
- List of non-responders

### Organizer tools:
- One-click **nudge** button — sends a reminder to all current non-responders
- **Auto-reminders:** fire 3 days after invite sent, then repeat every 3 days until the member responds. Targets non-responders only. Configurable cadence.

### Locking:
- Organizer reviews overlap heatmap, calls "these dates work," and locks them
- Does not require 100% response — organizer judgment call
- Locking Phase 1 sets Phase 2 status to `open`

---

## Phase 2 — AI Destination Suggestions

Powered by the Claude API. After dates are locked, the organizer configures inputs and generates destination suggestions for the group to vote on.

### Organizer inputs:
- **Skill mix** — rough text description of the group (e.g. "mostly mid-handicap, one or two scratch players") — organizer enters manually; members have no handicap/skill field
- **Budget tier filter** — "Show all," "Budget," "Midrange," or "Luxury" — pre-seeded from Phase 1 budget vote aggregate. Organizer can override.
- **Country** — defaults to United States; other countries selectable
- **"Generate Suggestions"** button

### AI integration:
- Claude API prompt includes: locked dates, group size, skill mix text, budget median + range, country, tier filter
- **Suggestions are persisted to `destination_suggestions` on the first successful response** — they are read from DB on all subsequent loads, not re-fetched
- `destination_suggestions` has a `generation_status ENUM(pending, complete, failed)` column
- On failure: show error state with a retry button. UI never shows a loading state longer than 30 seconds before surfacing an error.
- On retry: a new generation attempt overwrites `generation_status`; old results replaced only on success

### AI output — 3 destination cards:
- **Geographically diverse** — 3 different destinations calibrated to the group's actual budget. Tier is a filter, not the primary differentiator.
- Each card includes:
  - Destination name + region
  - Why it fits this group (dates, budget, skill mix)
  - Top courses in the area (name, rating, estimated green fee)
  - Estimated cost per person (rounds only, lodging TBD)
  - Course rating source (Golf Digest, GolfAdvisor, etc.) — recommendations must be transparent, not a black box
  - ⚠️ Note: "Popular courses at top destinations book 6–12 months out — check availability early"

### Voting:
- All members vote on destinations (👍/👎, one vote per option per member)
- Plurality wins; organizer has override/tiebreaker (recorded in `trip_decisions`)
- Organizer locks one destination → Phase 3 status set to `open`

### Running cost estimate begins:
- Formula: average green fees across destination's top courses × number of rounds
- Displayed as range: "~$X–$Y/person (rounds only) · updates as decisions lock"
- Range format until lodging is locked

---

## Phase 3 — Courses + Lodging (Parallel Tracks)

Both tracks open simultaneously when Phase 2 locks. They are fully independent — lodging voting can proceed before any round is locked and vice versa. Phase 4 becomes available only when **all rounds AND lodging** are locked.

### 3A — Courses (Round by Round)

Golf trips typically mix tiers — one nice course, a couple of great-value rounds. Courses are selected **per round**, not as an undifferentiated list.

**Setup (organizer, once per trip):**
- "How many rounds?" (e.g. 3)
- "How do you want to split them?" — assign a tier per round slot: Premium / Midrange / Value
  - e.g. Round 1: Premium, Round 2: Value, Round 3: Value

**Per round (independent voting):**
- AI generates 3–4 course options at that round's tier, near the destination. Persisted to DB on success (`generation_status` pattern same as Phase 2).
- Group votes per round independently (👍/👎, one vote per option per member)
- **Manual add:** Any member can search by course name or city and nominate a course for any round. Nominated courses enter the vote pool automatically. Organizer can remove any nomination.
- **"Suggest more"** escape hatch if group rejects all options — generates a fresh set (appended, not replacing existing options)
- Organizer locks a winner per round (plurality or override); recorded in `trip_decisions`

**Course card fields:**
- Name, location
- Course rating + slope
- Par and yardage (multiple tee options)
- Green fee + cart fee (listed separately)
- Walking vs. cart policy
- Architect
- Pace of play reputation
- Tee time availability window (e.g. "Opens 60 days out")
- Rating source (Golf Digest / GolfAdvisor / etc.)

### 3B — Lodging

**Setup (organizer):**
- **Lodging type toggle:** Rental House / Hotel / Show Both — first-class choice made before options are surfaced. For groups of 4–8, this is a trip identity decision (logistics, cost, evening vibe), not a preference.

**Options:**
- AI suggests lodging options near destination, matched to lodging type. Same `generation_status` persistence pattern.
- Each option: name, type, price/night, beds/capacity, distance to each locked/leading course, booking link
- Anyone can add an option manually
- Group votes (👍/👎); organizer locks (plurality or override); recorded in `trip_decisions`

**Cost estimate update:**
- Once lodging locks: estimate = (locked lodging price/night × nights ÷ group size) + (avg green fees × rounds)
- Displayed as a tighter per-person number, no longer a range

---

## Phase 4 — Lock It In

Organizer reviews the final state and triggers the lock. **Phase 4 is only reachable when all round slots AND lodging are locked.**

### Confirmation checklist:
- Final dates ✓
- Destination ✓
- Round 1 course ✓
- Round 2 course ✓ (and Round 3+, etc.)
- Lodging ✓

### "We're Going!" moment:
- Full-screen hype moment for all members — the emotional peak, styled accordingly
- **Shareable trip page** at `/trips/:id/share` — a public, styled summary page. No login required to view. Designed to be linkable and screenshottable. Content: trip name, destination, dates, who's going (first names), courses by round, lodging name. No PDF or image generation needed.

### Follow-up screen (separate from the hype moment):
- "Next steps" card: "Book your tee times ASAP" with direct booking links for each course
- All `trip_decisions` are frozen — status set to immutable, no further edits possible

### Notifications:
- Email summary queued (not sent inline — see Email section) to all confirmed members: dates, destination, courses by round, lodging, shareable link

---

## Always-On Features (All Phases)

| Feature | Description |
|---|---|
| Who's responded | Public panel — all members see who has/hasn't responded to availability and active votes |
| Running cost estimate | ~$X–$Y/person (rounds only) until lodging locks, then tighter per-person total |
| Auto-reminders | Fire 3 days after invite, repeat every 3 days until member responds. Non-responders only. |
| Organizer nudge | One-click manual reminder to all current non-responders |
| Decision history | Immutable activity log — `trip_decisions` with `decision_type`, entity FK, `decided_by`, `decided_at` |
| Invite link | Persistent shareable link to join the trip |

---

## Technical Approach

### Stack (existing, keep):
- **Backend:** FastAPI + PostgreSQL + SQLAlchemy
- **Frontend:** React 18 + Vite + Zustand + React Router 6
- **Auth:** JWT email/password (keep as-is)

### Key new integrations:

**Claude API (Anthropic):**
- Used for: destination suggestions (Phase 2), course suggestions per round (Phase 3A), lodging suggestions (Phase 3B)
- All results persisted to DB on first successful call and served from DB thereafter
- `generation_status ENUM(pending, complete, failed)` on all AI-generated tables
- Failure handling: error UI with retry button; no blocking spinners beyond 30s

**Email (async queue):**
- Emails are never sent inline — all sends go through an `email_queue` table with `status ENUM(pending, sent, failed)` and a `send_after TIMESTAMP`
- A background worker processes the queue; UI never blocks on email I/O
- Retry up to 3 times on failure, then mark `failed` and log
- Use SendGrid or SMTP (configured via env var)

**Course data:** Claude API + Overpass API for nearby discovery. Course cards populate from AI response.  
**Lodging data:** Claude API suggestions. Members can add manual links.

### What to keep from current build:
- Auth system (login, register, JWT, `/auth/me`)
- Trip creation + invite link flow
- Overpass API integration (repurposed for Phase 3 course search)
- `users` and `trips` DB tables (extend, don't rewrite)

### What to rebuild:
- Trip wizard → replaced by Trip Room phase dashboard
- Availability step → new calendar-based picker with overlap heatmap
- Course voting → round-by-round with richer course cards
- Location step → removed (replaced by AI destination suggestions in Phase 2)

### Data model:

| Table | Key columns |
|---|---|
| `trip_phases` | `trip_id`, `phase ENUM`, `status ENUM`, `locked_at`, `locked_by` |
| `availability_responses` | `trip_id`, `user_id`, `date_ranges JSONB`, `happy_spend`, `hard_limit` |
| `destination_suggestions` | `trip_id`, `generation_status ENUM`, `suggestions JSONB`, `locked_destination JSONB` |
| `trip_rounds` | `trip_id`, `round_number`, `tier ENUM(premium, midrange, value)` |
| `course_nominations` | `trip_id`, `round_id`, `course_data JSONB`, `nominated_by`, `generation_status ENUM` |
| `course_votes` | `nomination_id`, `user_id`, `vote ENUM(up, down)` |
| `lodging_options` | `trip_id`, `lodging_data JSONB`, `added_by`, `generation_status ENUM` |
| `lodging_votes` | `option_id`, `user_id`, `vote ENUM(up, down)` |
| `trip_decisions` | `trip_id`, `decision_type ENUM(date_locked, destination_locked, round_locked, lodging_locked, trip_locked)`, `entity_id`, `entity_type`, `decided_by`, `decided_at`, `override BOOLEAN` |
| `email_queue` | `trip_id`, `recipient_user_id`, `template`, `payload JSONB`, `status ENUM`, `send_after`, `attempts` |

---

## Out of Scope

- Real-time tee time booking integration (each course system is different)
- Cost splitting / deposit tracking → handled by TripSplit (future integration)
- Real-time collaborative editing (WebSocket-level)
- Schedule flexibility when a round falls through (v2)
- Google/social login
- Mobile native app
