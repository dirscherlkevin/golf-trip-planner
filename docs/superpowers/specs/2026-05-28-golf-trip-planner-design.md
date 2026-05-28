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

The app is structured as a **Trip Room** — a shared space where all trip state lives. Phases gate in sequence (each unlocks after the previous is completed), but within a phase everything is visible to all members. The organizer controls progression; members participate and vote.

```
Phase 1: Availability  →  Phase 2: Destination  →  Phase 3: Courses + Lodging  →  Phase 4: Lock It In
(gates all)                (AI-powered)               (parallel tracks)              (the moment)
```

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
- Budget aggregate: median happy-spend, median hard limit, full range
- Group size auto-populated from respondents (no manual counting)
- List of non-responders

### Organizer tools:
- One-click **nudge** button — sends a reminder to all non-responders
- Auto-reminders fire automatically after X days of no response (configurable, default: 3 days)

### Locking:
- Organizer reviews overlap heatmap, calls "these dates work," and locks them
- Does not require 100% response — organizer judgment call
- Locked dates open Phase 2

---

## Phase 2 — AI Destination Suggestions

Powered by the Claude API. After dates are locked, the organizer configures inputs and generates destination suggestions for the group to vote on.

### Organizer inputs:
- **Skill mix** — rough breakdown of the group (e.g. "mostly mid-handicap, one or two scratch players") — organizer enters this manually; members do not have a handicap/skill field
- **Budget tier filter** — "Show all," "Budget," "Midrange," or "Luxury" — pre-seeded from Phase 1 budget vote aggregate. Organizer can override.
- **Country** — defaults to United States; other countries selectable
- **"Generate Suggestions"** button

### AI output — 3 destination cards:
- **Geographically diverse** — not 3 price tiers, but 3 different destinations calibrated to the group's actual budget. Tier is a filter, not the primary differentiator.
- Each card includes:
  - Destination name + region
  - Why it fits this group (dates, budget, skill mix)
  - Top courses in the area (name, rating, estimated green fee)
  - Estimated cost per person (rounds only, lodging TBD)
  - Course rating source (Golf Digest, GolfAdvisor, etc.) — AI recommendations must be transparent, not a black box
  - ⚠️ Note: "Popular courses at top destinations book 6–12 months out — check availability early"

### Voting:
- All members vote on destinations
- **Tiebreaker:** Organizer has explicit final-say override — no runoff mechanic
- Organizer locks one destination → Phase 3 unlocks

### Running cost estimate begins:
- Shows "~$X–$Y/person · updates as decisions lock"
- Range format, not a tight number, until lodging is chosen

---

## Phase 3 — Courses + Lodging (Parallel Tracks)

Both tracks open simultaneously after destination is locked. Organizer can lock each independently when the group reaches consensus.

### 3A — Courses (Round by Round)

Golf trips typically mix tiers — one nice course, a couple of great-value rounds. Courses are selected **per round**, not as an undifferentiated list.

**Setup (organizer):**
- "How many rounds?" (e.g. 3)
- "How do you want to split them?" — e.g. 1 Premium + 2 Value, or 2 Premium + 1 Value
  - Options: Premium / Midrange / Value per round slot

**Per round:**
- AI generates 3–4 course options at that round's tier, near the destination
- Group votes per round independently (👍/👎)
- **Manual add:** Any member can search by course name or city and nominate a course for any round — nominated courses enter the vote pool automatically. Organizer can remove any nomination.
- **"Suggest more"** escape hatch if group rejects all options — generates a fresh set
- Organizer locks a winner per round when consensus is clear

**Course card fields:**
- Name, location
- Course rating + slope
- Par and yardage (multiple tee options)
- Green fee (with cart noted separately)
- Walking vs. cart policy
- Architect
- Pace of play reputation
- Tee time availability window (e.g. "Opens 60 days out")
- Rating source (Golf Digest / GolfAdvisor / etc.)

### 3B — Lodging

**Setup (organizer):**
- **Lodging type toggle:** Rental House / Hotel / Show Both — first-class choice, not a filter
  - For groups of 4–8, rental vs. hotel is a trip identity decision (logistics, cost, evening vibe)

**Options:**
- AI suggests lodging options near destination, matched to lodging type preference
- Each option: name, type, price/night, beds/capacity, distance to each chosen course, link
- Anyone can add an option manually
- Group votes (👍/👎)
- Organizer locks when ready

**Cost estimate:**
- Updates to a tighter number once lodging is locked (lodging + estimated rounds per person)

---

## Phase 4 — Lock It In

Organizer reviews the final state and pulls the trigger. Phase 4 becomes available only when all rounds AND lodging are locked.

### Confirmation checklist:
- Final dates ✓
- Destination ✓
- Round 1 course ✓
- Round 2 course ✓ (and Round 3, etc.)
- Lodging ✓

### "We're Going!" moment:
- Full-screen hype moment for all members — this is the emotional peak, designed accordingly
- **Shareable summary card** — designed to be screenshot/dropped into a group chat. Includes: destination, dates, who's going, courses, lodging. Works outside the app.

### Follow-up screen (separate from the hype moment):
- "Next steps" card: "Book your tee times ASAP — here are the direct links for each course"
- Decision history is frozen — logged and immutable, no re-litigation possible

### Notifications:
- Email summary sent to all confirmed members: dates, destination, courses, lodging

---

## Always-On Features (All Phases)

| Feature | Description |
|---|---|
| Who's responded | Public panel — all members see who has/hasn't responded to availability and active votes |
| Running cost estimate | ~$X–$Y/person, updates as decisions lock, tightens when lodging is chosen |
| Auto-reminders | Fires to non-responders after X days (configurable, default 3 days) |
| Organizer nudge | One-click sends reminder to all outstanding non-responders |
| Decision history | Immutable activity log — what was decided, when, by whom |
| Invite link | Persistent shareable link to join the trip |

---

## Technical Approach

### Stack (existing, keep):
- **Backend:** FastAPI + PostgreSQL + SQLAlchemy
- **Frontend:** React 18 + Vite + Zustand + React Router 6
- **Auth:** JWT email/password (keep as-is)

### Key new integrations:
- **Claude API (Anthropic):** Destination suggestions (Phase 2) and course/lodging suggestions (Phase 3). Prompt takes: locked dates, group size, skill mix, budget aggregate, country, round split. Returns structured JSON.
- **Course data:** Claude API research + existing Overpass API for nearby course discovery. Course cards supplement with Golf Digest / GolfAdvisor data where available.
- **Lodging data:** Claude API research for lodging suggestions near destination. Members can also add manual links (Airbnb, VRBO, hotel).
- **Email:** Simple email notifications for reminders and the Phase 4 summary (e.g. SendGrid or SMTP).

### What to keep from current build:
- Auth system (login, register, JWT, `/auth/me`)
- Trip creation + invite link flow
- Overpass API + Leaflet map (course discovery, repurposed for Phase 3)
- Database structure for Users and Trips (extend, don't rewrite)

### What to rebuild:
- Trip wizard → replaced by Trip Room (phase-based dashboard)
- Availability step → new calendar-based availability picker with overlap heatmap
- Course voting → rebuilt as round-by-round with richer course cards
- Location step → removed (replaced by AI destination suggestions)

### Data model additions needed:
- `trip_phases` — current phase state per trip
- `availability_responses` — per-user date ranges
- `budget_votes` — silent, per-user, two fields (happy_spend, hard_limit)
- `destination_suggestions` — AI-generated, stored per trip
- `trip_rounds` — number of rounds + tier per round
- `course_nominations` — per round, per trip, with vote counts
- `lodging_options` — per trip, with vote counts
- `trip_decisions` — immutable log of locked decisions

---

## Out of Scope

- Real-time tee time booking integration (each course system is different)
- Cost splitting / deposit tracking → handled by TripSplit (future integration)
- Real-time collaborative editing (WebSocket-level)
- Schedule flexibility when a round falls through (v2)
- Google/social login
- Mobile native app
