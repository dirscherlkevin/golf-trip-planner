from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.phase import PhaseName
from models.trip import Trip
from schemas.phase import TripPhaseOut, LockPhaseIn
from services.phases import get_phases, lock_phase, reopen_phase

router = APIRouter()

@router.get("/{trip_id}/phases", response_model=list[TripPhaseOut])
def list_phases(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    phases = get_phases(trip_id, db)
    if not phases:
        raise HTTPException(status_code=404, detail="Trip not found")
    return phases

@router.post("/{trip_id}/phases/{phase}/lock", response_model=TripPhaseOut)
def lock_trip_phase(
    trip_id: int,
    phase: PhaseName,
    body: LockPhaseIn = LockPhaseIn(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # If locking availability, require dates
    if phase == PhaseName.availability:
        if not body.trip_start or not body.trip_end:
            raise HTTPException(status_code=400, detail="trip_start and trip_end are required to lock availability")
        if body.trip_end < body.trip_start:
            raise HTTPException(status_code=400, detail="trip_end must be on or after trip_start")
        trip = db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        trip.trip_start = body.trip_start
        trip.trip_end = body.trip_end

    locked = lock_phase(trip_id, phase, user.id, db, body.entity_id, body.entity_type, body.override)
    db.commit()
    db.refresh(locked)
    return locked

@router.post("/{trip_id}/phases/{phase}/reopen", response_model=TripPhaseOut)
def reopen_trip_phase(
    trip_id: int,
    phase: PhaseName,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    reopened = reopen_phase(trip_id, phase, user.id, db)
    db.commit()
    db.refresh(reopened)
    return reopened
