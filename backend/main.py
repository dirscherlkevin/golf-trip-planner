from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base

import models.user  # noqa
import models.trip  # noqa
import models.phase  # noqa
import models.availability  # noqa
import models.decision  # noqa
import models.email_queue  # noqa
import models.destination  # noqa
import models.round  # noqa
import models.lodging  # noqa

app = FastAPI(title="Golf Trip Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

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
