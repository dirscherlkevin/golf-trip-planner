import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from sqlalchemy import text

import models.user  # noqa
import models.trip  # noqa
import models.phase  # noqa
import models.availability  # noqa
import models.decision  # noqa
import models.email_queue  # noqa
import models.destination  # noqa
import models.round  # noqa
import models.lodging  # noqa

@asynccontextmanager
async def lifespan(app):
    if not os.getenv("SECRET_KEY"):
        raise RuntimeError(
            "SECRET_KEY environment variable is required. "
            "Set it in your .env file before starting the server."
        )
    if not os.getenv("DATABASE_URL"):
        raise RuntimeError(
            "DATABASE_URL environment variable is required. "
            "Set it in your .env file before starting the server."
        )
    yield  # email worker disabled — no SMTP configured


app = FastAPI(title="Golf Trip Planner API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://golftrip-af5aa.web.app", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

import logging as _logging
_mlog = _logging.getLogger("migrations")

# Additive migrations — each wrapped independently so one failure doesn't block startup
_MIGRATIONS = [
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS tee_time VARCHAR(255)",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS round_date DATE",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS booked BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS confirmation_number VARCHAR(255)",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS public_courses_only BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS lodging_booked BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS lodging_confirmation VARCHAR(255)",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS lodging_skipped BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS handicap FLOAT",
    "ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS handicap FLOAT",
    "ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE lodging_options ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS golfers_per_tee INTEGER",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_tagline TEXT",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_happy_spend FLOAT",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_hard_limit FLOAT",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_token VARCHAR(36)",
    "ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS flights JSONB",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_golf_per_person FLOAT",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_lodging_per_person FLOAT",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS green_fee_override FLOAT",
    "ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS cart_fee_override FLOAT",
    "UPDATE trips SET share_token = gen_random_uuid()::text WHERE share_token IS NULL",
    "ALTER TABLE destination_votes DROP CONSTRAINT IF EXISTS uq_dest_vote_trip_user",
    """DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_dest_vote_trip_user_dest') THEN
        ALTER TABLE destination_votes ADD CONSTRAINT uq_dest_vote_trip_user_dest UNIQUE (trip_id, user_id, destination_index);
      END IF;
    END $$""",
    "ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_rentals JSONB",
    "ALTER TABLE restaurant_picks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
    """CREATE TABLE IF NOT EXISTS restaurant_picks (
        id           SERIAL PRIMARY KEY,
        trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        round_id     INTEGER REFERENCES trip_rounds(id) ON DELETE SET NULL,
        name         TEXT NOT NULL,
        cuisine      TEXT,
        price_range  TEXT,
        vibe         TEXT,
        reason       TEXT,
        address      TEXT,
        phone        TEXT,
        maps_url     TEXT,
        created_at   TIMESTAMP DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS restaurant_votes (
        id         SERIAL PRIMARY KEY,
        pick_id    INTEGER NOT NULL REFERENCES restaurant_picks(id) ON DELETE CASCADE,
        user_id    INTEGER,
        user_name  TEXT NOT NULL,
        vote       TEXT NOT NULL CHECK (vote IN ('up', 'down')),
        voted_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE(pick_id, user_id)
    )""",
]

with engine.connect() as _conn:
    for _stmt in _MIGRATIONS:
        try:
            _conn.execute(text(_stmt))
        except Exception as _e:
            _mlog.warning("Migration skipped (%s): %.120s", type(_e).__name__, _stmt.strip().split('\n')[0])
    _conn.commit()

from api.auth import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["auth"])

from api.trips import router as trips_router
app.include_router(trips_router, prefix="/trips", tags=["trips"])

from api.phases import router as phases_router
app.include_router(phases_router, prefix="/trips", tags=["phases"])

from api.availability import router as availability_router
app.include_router(availability_router, prefix="/trips", tags=["availability"])

from api.destinations import router as destinations_router
app.include_router(destinations_router, prefix="/trips", tags=["destinations"])

from api.rounds import router as rounds_router
app.include_router(rounds_router, prefix="/trips", tags=["rounds"])

from api.lodging import router as lodging_router
app.include_router(lodging_router, prefix="/trips", tags=["lodging"])

from api.share import router as share_router
app.include_router(share_router, prefix="/share", tags=["share"])

from api.users import router as users_router
app.include_router(users_router, prefix="/users", tags=["users"])

from api.restaurants import router as restaurants_router
app.include_router(restaurants_router, prefix="/trips", tags=["restaurants"])
