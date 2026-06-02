from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from api.auth import get_current_user
from models.trip import Trip, TripMember
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption
from models.destination import DestinationSuggestion
from models.user import User
from services.claude import suggest_restaurants

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_member(trip_id: int, user: User, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "joined",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip


def _derive_location(trip_id: int, round_id: Optional[int], trip: Trip, db: Session) -> str:
    if round_id is not None:
        trip_round = db.query(TripRound).filter(
            TripRound.id == round_id,
            TripRound.trip_id == trip_id,
        ).first()
        if trip_round and trip_round.locked_course_id:
            nomination = db.query(CourseNomination).filter(
                CourseNomination.id == trip_round.locked_course_id
            ).first()
            if nomination:
                cd = nomination.course_data or {}
                name = cd.get("name", "")
                loc = cd.get("location", "")
                return f"{name}, {loc}".strip(", ") or "the golf course"
        # No locked course — fall through to lodging/destination fallback

    # Lodging fallback
    lodging = db.query(LodgingOption).filter(
        LodgingOption.trip_id == trip_id,
        LodgingOption.is_locked == True,
    ).first()
    if lodging:
        od = lodging.option_data or {}
        name = od.get("name", "")
        addr = od.get("address", "")
        return f"{name}, {addr}".strip(", ") or "the lodging"

    # Destination fallback
    dest_suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if dest_suggestion and dest_suggestion.locked_destination:
        return (dest_suggestion.locked_destination or {}).get("name", "the destination")

    return "the destination"


# ── schemas ───────────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    round_id: Optional[int] = None
    vibe_types: List[str] = []
    discover_modes: List[str] = []
    hide_chains: bool = False
    extra_notes: str = ""


class SavePickRequest(BaseModel):
    round_id: Optional[int] = None
    name: str
    cuisine: Optional[str] = None
    price_range: Optional[str] = None
    vibe: Optional[str] = None
    reason: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    maps_url: Optional[str] = None


class VoteRequest(BaseModel):
    vote: str  # "up" | "down"


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{trip_id}/restaurants/suggest")
def suggest(
    trip_id: int,
    body: SuggestRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_member(trip_id, user, db)
    location = _derive_location(trip_id, body.round_id, trip, db)

    member_count = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined",
    ).count()

    results = suggest_restaurants(
        location=location,
        group_size=member_count or 4,
        vibe_types=body.vibe_types,
        discover_modes=body.discover_modes,
        hide_chains=body.hide_chains,
        extra_notes=body.extra_notes,
    )
    return results
