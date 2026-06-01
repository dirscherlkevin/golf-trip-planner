from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.trip import Trip, TripMember
from models.round import TripRound
from models.user import User
from models.phase import TripPhase, PhaseStatus, PhaseName
from models.availability import AvailabilityResponse
from schemas.trip import TripCreate, TripOut, InviteCreate, InviteOut
from api.auth import get_current_user
from services.phases import initialize_phases
from services.cost import compute_cost_estimate
from datetime import datetime, timezone
import os
import uuid

router = APIRouter()

@router.post("", response_model=TripOut)
def create_trip(data: TripCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = Trip(name=data.name, organizer_id=user.id)
    db.add(trip)
    db.flush()
    member = TripMember(
        trip_id=trip.id,
        user_id=user.id,
        invite_email=user.email,
        joined="joined",
    )
    db.add(member)
    db.flush()
    initialize_phases(trip.id, db)
    db.commit()
    db.refresh(trip)
    return trip

@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member_trip_ids = (
        db.query(TripMember.trip_id)
        .filter(TripMember.user_id == user.id, TripMember.joined == "joined")
        .scalar_subquery()
    )
    trips = db.query(Trip).filter(Trip.id.in_(member_trip_ids)).all()
    if not trips:
        return []

    trip_ids = [t.id for t in trips]

    # Batch: get open phases for all trips
    open_phases = db.query(TripPhase).filter(
        TripPhase.trip_id.in_(trip_ids),
        TripPhase.status == PhaseStatus.open
    ).all()
    open_phase_map = {p.trip_id: p.phase.value for p in open_phases}

    # Batch: get availability responses for user in these trips
    avail_responses = db.query(AvailabilityResponse.trip_id).filter(
        AvailabilityResponse.trip_id.in_(trip_ids),
        AvailabilityResponse.user_id == user.id
    ).all()
    responded_trip_ids = {r.trip_id for r in avail_responses}

    result = []
    for trip in trips:
        if trip.status == "finalized":
            current_phase = "finalized"
            action_pending = False
        else:
            current_phase = open_phase_map.get(trip.id)
            if current_phase == "availability":
                action_pending = trip.id not in responded_trip_ids
            elif current_phase in ("destination", "planning"):
                action_pending = True
            else:
                action_pending = False

        out = TripOut.model_validate(trip)
        out = out.model_copy(update={"current_phase": current_phase, "user_action_pending": action_pending})
        result.append(out)

    return result

# Must be defined before /{trip_id} routes so "invites" isn't matched as an integer
@router.get("/invites")
def list_pending_invites(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return trips where the current user has a pending invite."""
    pending = (
        db.query(TripMember)
        .filter(TripMember.user_id == user.id, TripMember.joined == "pending")
        .all()
    )
    result = []
    for m in pending:
        trip = db.query(Trip).filter(Trip.id == m.trip_id).first()
        if not trip:
            continue
        organizer = db.query(User).filter(User.id == trip.organizer_id).first()
        organizer_name = _email_to_name(organizer.email) if organizer else "Someone"
        result.append({
            "trip_id": trip.id,
            "trip_name": trip.name,
            "organizer_name": organizer_name,
            "invite_email": m.invite_email,
        })
    return result

@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)

    if trip.status == "finalized":
        current_phase = "finalized"
        action_pending = False
    else:
        open_phase = db.query(TripPhase).filter(
            TripPhase.trip_id == trip_id,
            TripPhase.status == PhaseStatus.open
        ).first()
        current_phase = open_phase.phase.value if open_phase else None
        if current_phase == "availability":
            has_responded = db.query(AvailabilityResponse).filter(
                AvailabilityResponse.trip_id == trip_id,
                AvailabilityResponse.user_id == user.id
            ).first() is not None
            action_pending = not has_responded
        elif current_phase in ("destination", "planning"):
            action_pending = True
        else:
            action_pending = False

    out = TripOut.model_validate(trip)
    out = out.model_copy(update={"current_phase": current_phase, "user_action_pending": action_pending})
    return out

@router.post("/{trip_id}/invite", response_model=InviteOut)
def invite_member(trip_id: int, data: InviteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can invite members")

    # Check for duplicate invite
    existing = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.invite_email == data.email.lower(),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This person has already been invited")

    token = str(uuid.uuid4())
    # Link to existing user account if email matches (case-insensitive)
    invited_user = db.query(User).filter(User.email.ilike(data.email)).first()
    member = TripMember(
        trip_id=trip_id,
        invite_email=data.email.lower(),
        invite_token=token,
        user_id=invited_user.id if invited_user else None,
        joined="pending",
    )
    db.add(member)
    db.commit()
    base = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
    return InviteOut(invite_token=token, invite_url=f"{base}/join/{token}")

@router.post("/join/{invite_token}", response_model=TripOut)
def join_trip_by_token(invite_token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(TripMember).filter(TripMember.invite_token == invite_token).first()
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found")
    if member.joined == "joined":
        raise HTTPException(status_code=400, detail="Invite already used")
    if member.invite_email and member.invite_email.lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="This invite was sent to a different email address")
    member.user_id = user.id
    member.joined = "joined"
    member.joined_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(member)
    return member.trip

@router.post("/{trip_id}/join", response_model=TripOut)
def join_trip_from_dashboard(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Accept a pending invite from the dashboard (no token needed — invite already linked to user)."""
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "pending",
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="No pending invite found for this trip")
    member.joined = "joined"
    member.joined_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(member)
    return member.trip

@router.delete("/{trip_id}/invite")
def decline_invite(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Decline (remove) a pending invite."""
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "pending",
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="No pending invite found for this trip")
    db.delete(member)
    db.commit()
    return {"ok": True}

@router.post("/{trip_id}/unlock")
def unlock_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from models.trip import TripStatus
    from models.phase import TripPhase, PhaseStatus, PhaseName
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can unlock this trip")
    if trip.status != TripStatus.finalized:
        raise HTTPException(status_code=400, detail="Trip is not finalized")
    trip.status = TripStatus.planning
    planning_phase = db.query(TripPhase).filter(
        TripPhase.trip_id == trip_id, TripPhase.phase == PhaseName.planning
    ).first()
    if planning_phase:
        planning_phase.status = PhaseStatus.open
    locked_in_phase = db.query(TripPhase).filter(
        TripPhase.trip_id == trip_id, TripPhase.phase == PhaseName.locked_in
    ).first()
    if locked_in_phase:
        locked_in_phase.status = PhaseStatus.pending
    db.commit()
    return {"ok": True}

@router.delete("/{trip_id}")
def delete_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can delete this trip")
    trip.locked_lodging_option_id = None
    db.query(TripRound).filter(TripRound.trip_id == trip_id).update({"locked_course_id": None})
    db.flush()
    db.delete(trip)
    db.commit()
    return {"ok": True}

class _HandicapBody(BaseModel):
    handicap: Optional[float] = None

@router.patch("/{trip_id}/members/handicap")
def update_handicap(trip_id: int, body: _HandicapBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.user_id == user.id, TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not a member of this trip")
    member.handicap = body.handicap
    db.commit()
    return {"ok": True, "handicap": member.handicap}

@router.post("/{trip_id}/nudge/{target_user_id}", status_code=204)
def nudge_member(trip_id: int, target_user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip or trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can nudge members")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.user_id == target_user_id, TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.last_nudged_at = datetime.now(timezone.utc)
    db.commit()

class _LodgingBookedBody(BaseModel):
    booked: bool
    confirmation_number: Optional[str] = None

@router.patch("/{trip_id}/lodging-booked")
def set_lodging_booked(trip_id: int, body: _LodgingBookedBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can mark lodging as booked")
    trip.lodging_booked = body.booked
    if body.confirmation_number is not None:
        trip.lodging_confirmation = body.confirmation_number or None
    db.commit()
    return {"ok": True, "lodging_booked": trip.lodging_booked}

class _LodgingSkippedBody(BaseModel):
    skipped: bool

@router.patch("/{trip_id}/lodging-skipped")
def set_lodging_skipped(trip_id: int, body: _LodgingSkippedBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can skip lodging")
    trip.lodging_skipped = body.skipped
    db.commit()
    return {"ok": True, "lodging_skipped": trip.lodging_skipped}

@router.get("/{trip_id}/past-golfers")
def get_past_golfers(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return distinct emails of people from the user's other trips, excluding already-invited emails."""
    _get_trip_for_member(trip_id, user.id, db)
    other_trip_ids = db.query(TripMember.trip_id).filter(
        TripMember.user_id == user.id,
        TripMember.joined == "joined",
        TripMember.trip_id != trip_id,
    )
    existing_emails = db.query(TripMember.invite_email).filter(TripMember.trip_id == trip_id)
    rows = (
        db.query(TripMember.invite_email)
        .filter(
            TripMember.trip_id.in_(other_trip_ids),
            TripMember.invite_email.isnot(None),
            TripMember.invite_email != user.email,
            TripMember.invite_email.notin_(existing_emails),
        )
        .distinct()
        .all()
    )
    return [r[0] for r in rows]

@router.get("/{trip_id}/cost")
def get_cost_estimate(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "joined",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return compute_cost_estimate(trip_id, db)


def _email_to_name(email: str) -> str:
    local = email.split('@')[0]
    return local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()


def _get_trip_for_member(trip_id: int, user_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.user_id == user_id, TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip
