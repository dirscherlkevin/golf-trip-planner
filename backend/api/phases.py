from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.phase import PhaseName
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
