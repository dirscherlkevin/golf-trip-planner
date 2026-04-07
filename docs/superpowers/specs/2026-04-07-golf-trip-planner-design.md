# Golf Trip Planner — Design Spec
**Date:** 2026-04-07  
**Status:** Approved  

---

## Overview

A collaborative web app for groups of friends to plan golf trips together. One person creates a trip and invites the group; all members contribute their availability, vote on courses, and the app recommends optimal trip dates based on group availability, weather patterns, and course preferences.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite), Leaflet.js, dark theme |
| Backend | Python FastAPI |
| Database | PostgreSQL |
| Course data | OpenStreetMap / Overpass API (free, no key) |
| Reviews, photos, lodging | Google Places API (free tier, one API key) |
| Weather & seasonal data | Open-Meteo (free, no key) |

---

## Trip Planning Flow

The app is a 4-step wizard. Steps are sequential but the map persists and updates context as the user progresses.

### Step 1 — Group Availability
- Trip organizer creates a trip and shares an invite link
- Each member independently submits their available date ranges via a calendar UI
- Organizer sees a heatmap showing overlap: green (all available) → amber (some) → dark (unavailable)
- Pending members shown in sidebar with resend-invite option
- "Next" button activates once at least 2 members have submitted

### Step 2 — Location
- Group selects a destination state or city via search
- Radius slider (default 50 miles) defines the search area
- Backend queries Open-Meteo for historical weather patterns for that region
- Seasonal recommendation badge shown (e.g. "Oct–Apr ideal for AZ")
- Leaflet map loads showing the selected region; course and lodging pins populate

### Step 3 — Course Discovery
- Courses fetched from Overpass API, enriched with Google Places data (ratings, reviews, photos)
- Filter sidebar: difficulty (user-defined tag or derived from Google Places review sentiment), amenities (driving range, clubhouse, restaurant, pro shop), minimum rating, nearby lodging radius
- Map pins are clickable — opens course detail panel (description, photos, reviews, difficulty, amenities, weather at that location)
- Course list panel on the right shows results sorted by rating; members can vote on favorites
- Shortlisted courses saved to the trip

### Step 4 — Recommendation
- Backend scoring algorithm intersects:
  - Group availability overlap windows
  - Weather quality score for the region (temp, precipitation, wind — from Open-Meteo historical data)
  - Course vote tallies from Step 3
- Returns top 3 recommended trip date ranges, each showing:
  - Date range
  - Member availability count
  - Average weather conditions
  - Which top-voted courses are in the selected area
- Year-round weather bar chart displayed at the bottom for full seasonal context
- Organizer selects a date and the trip is finalized

---

## Architecture

```
golf-trip-planner/
├── frontend/               # React (Vite) app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Step pages (Availability, Location, Courses, Recommend)
│   │   ├── hooks/          # Data fetching hooks
│   │   └── store/          # Trip state management
│   └── public/
├── backend/                # Python FastAPI app
│   ├── api/                # Route handlers
│   ├── services/           # External API integrations (Overpass, Google Places, Open-Meteo)
│   ├── models/             # Database models
│   └── engine/             # Date recommendation scoring algorithm
├── docs/
│   └── superpowers/specs/  # Design specs
└── docker-compose.yml      # Local dev: FastAPI + PostgreSQL
```

---

## Data Model (key entities)

**Trip**
- id, name, organizer_user_id, destination_state, destination_city, radius_miles, status, finalized_dates

**TripMember**
- trip_id, user_id, invite_status, availability_submitted_at

**Availability**
- trip_id, user_id, date_ranges (array of start/end date pairs)

**CourseCache**
- osm_id, google_place_id, name, lat, lng, difficulty, holes, amenities, rating, review_count, last_fetched_at

**TripCourseVote**
- trip_id, course_id, user_id, vote (up/down)

**WeatherCache**
- lat, lng, month, avg_temp_f, avg_precipitation_mm, avg_wind_mph, last_fetched_at

---

## External API Integration

### OpenStreetMap / Overpass
- Query: `amenity=golf_course` within bounding box of selected region
- Returns: course name, location, number of holes, basic amenities tags
- No key required; respect rate limits with local caching (TTL: 7 days)

### Google Places API
- Used for: ratings, review count, user reviews, photos, nearby lodging
- Triggered after Overpass returns course list (enrichment pass)
- Free tier covers personal/small group usage well within $200/mo credit
- One API key required (instant, free to obtain)

### Open-Meteo
- Historical weather API: monthly averages by lat/lng for any location
- Used to build the seasonal quality score and the year-round weather chart
- No key required; cache responses per location/month (TTL: 30 days)

---

## Recommendation Engine

Scoring algorithm weights per trip date window:

| Factor | Weight |
|--------|--------|
| Group availability overlap (% of members free) | 50% |
| Weather quality score (temp comfort, low precip) | 30% |
| Course vote alignment (top-voted courses available) | 20% |

Outputs top 3 date ranges ranked by composite score, minimum 3-day window.

---

## UI Design

- **Theme:** Dark — deep navy/slate background (#0d1117 base), green accents for positive states, amber for warnings, blue for interactive elements
- **Map:** Leaflet.js with a dark tile layer; course pins (green), lodging pins (amber), selected course (blue highlight)
- **Navigation:** 4-step top tab bar; steps unlock sequentially
- **Responsiveness:** Desktop-first (trip planning is a seated activity); mobile-friendly layout is a stretch goal

---

## GitHub & Collaboration

- Repository: `golf-trip-planner` (public or private, owner: Dan)
- Branch strategy: `main` (stable) + feature branches
- `.gitignore` covers: `node_modules/`, `__pycache__/`, `.env`, `*.db`, `.superpowers/`
- `.env.example` committed with placeholder keys (Google Places API key, DB URL)
- README documents setup steps so collaborators (e.g. Michael) can onboard immediately

---

## Out of Scope (v1)

- Actual tee time booking
- Payment splitting
- Mobile app
- Real-time notifications (email/push)
- Social features (public trip profiles)
