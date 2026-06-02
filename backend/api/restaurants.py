from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
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


@router.get("/{trip_id}/restaurants")
def get_picks(
    trip_id: int,
    round_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)

    picks = db.execute(
        text("""
            SELECT * FROM restaurant_picks
            WHERE trip_id = :tid
            AND (
                (:rid IS NULL AND round_id IS NULL) OR
                (round_id = :rid)
            )
        """),
        {"tid": trip_id, "rid": round_id},
    ).fetchall()

    result = []
    for p in picks:
        votes = db.execute(
            text("SELECT user_id, user_name, vote FROM restaurant_votes WHERE pick_id = :pid"),
            {"pid": p.id},
        ).fetchall()
        up_voters = [v.user_name for v in votes if v.vote == "up"]
        down_voters = [v.user_name for v in votes if v.vote == "down"]
        my_vote = next((v.vote for v in votes if v.user_id == user.id), None)
        result.append({
            "id": p.id,
            "round_id": p.round_id,
            "name": p.name,
            "cuisine": p.cuisine,
            "price_range": p.price_range,
            "vibe": p.vibe,
            "reason": p.reason,
            "address": p.address,
            "phone": p.phone,
            "maps_url": p.maps_url,
            "up_votes": up_voters,
            "down_votes": down_voters,
            "my_vote": my_vote,
        })

    result.sort(key=lambda x: len(x["up_votes"]), reverse=True)
    return result


@router.post("/{trip_id}/restaurants")
def save_pick(
    trip_id: int,
    body: SavePickRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_member(trip_id, user, db)

    # Upsert: find existing pick by (trip_id, name, round_id)
    existing = db.execute(
        text("""
            SELECT id FROM restaurant_picks
            WHERE trip_id = :tid AND name = :name
            AND (
                (:rid IS NULL AND round_id IS NULL) OR
                (round_id = :rid)
            )
        """),
        {"tid": trip_id, "name": body.name, "rid": body.round_id},
    ).fetchone()

    if existing:
        pick_id = existing.id
    else:
        row = db.execute(
            text("""
                INSERT INTO restaurant_picks
                    (trip_id, round_id, name, cuisine, price_range, vibe, reason, address, phone, maps_url)
                VALUES
                    (:tid, :rid, :name, :cuisine, :price_range, :vibe, :reason, :address, :phone, :maps_url)
                RETURNING id
            """),
            {
                "tid": trip_id, "rid": body.round_id, "name": body.name,
                "cuisine": body.cuisine, "price_range": body.price_range,
                "vibe": body.vibe, "reason": body.reason,
                "address": body.address, "phone": body.phone, "maps_url": body.maps_url,
            },
        ).fetchone()
        pick_id = row.id

    # Implicit up-vote for the saver (upsert)
    db.execute(
        text("""
            INSERT INTO restaurant_votes (pick_id, user_id, user_name, vote)
            VALUES (:pid, :uid, :uname, 'up')
            ON CONFLICT (pick_id, user_id) DO UPDATE SET vote = 'up'
        """),
        {"pid": pick_id, "uid": user.id, "uname": user.name},
    )
    db.commit()
    return {"id": pick_id}
