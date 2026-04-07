from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base

# Import models so Base.metadata knows about them
import models.user  # noqa
import models.trip  # noqa
import models.availability  # noqa

app = FastAPI(title="Golf Trip Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

from api.auth import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["auth"])

from api.trips import router as trips_router
app.include_router(trips_router, prefix="/trips", tags=["trips"])
