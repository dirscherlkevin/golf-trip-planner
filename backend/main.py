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
    yield  # email worker disabled — no SMTP configured


app = FastAPI(title="Golf Trip Planner API", lifespan=lifespan)

_cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins.split(",") if _cors_origins != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Additive column migrations (safe to re-run with IF NOT EXISTS)
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS tee_time VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS round_date DATE"))
    _conn.execute(text("ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS booked BOOLEAN NOT NULL DEFAULT FALSE"))
    _conn.execute(text("ALTER TABLE trip_rounds ADD COLUMN IF NOT EXISTS confirmation_number VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE trips ADD COLUMN IF NOT EXISTS public_courses_only BOOLEAN NOT NULL DEFAULT TRUE"))
    _conn.execute(text("ALTER TABLE trips ADD COLUMN IF NOT EXISTS lodging_booked BOOLEAN NOT NULL DEFAULT FALSE"))
    _conn.execute(text("ALTER TABLE trips ADD COLUMN IF NOT EXISTS lodging_confirmation VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS handicap FLOAT"))
    _conn.execute(text("ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMP WITH TIME ZONE"))
    _conn.execute(text("ALTER TABLE destination_votes DROP CONSTRAINT IF EXISTS uq_dest_vote_trip_user"))
    _conn.execute(text("""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_dest_vote_trip_user_dest') THEN
            ALTER TABLE destination_votes ADD CONSTRAINT uq_dest_vote_trip_user_dest UNIQUE (trip_id, user_id, destination_index);
          END IF;
        END $$
    """))
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
