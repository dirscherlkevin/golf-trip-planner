from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from api.auth import get_current_user
from models.trip import Trip, TripMember
from models.user import User
from models.destination import DestinationSuggestion
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption
from services.claude import generate_trip_tagline

router = APIRouter()


def _email_to_display_name(email: str) -> str:
    local = email.split('@')[0]
    return local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()


def _fmt_date(d) -> str:
    if not d:
        return ''
    return f"{d.strftime('%b')} {d.day}, {d.year}"


@router.get("/{identifier}")
def get_trip_share(identifier: str, db: Session = Depends(get_db)):
    import re
    _UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
    if _UUID_RE.match(identifier):
        trip = db.query(Trip).filter(Trip.share_token == identifier).first()
    else:
        try:
            trip = db.query(Trip).filter(Trip.id == int(identifier)).first()
        except ValueError:
            raise HTTPException(status_code=404, detail="Trip not found")
    # 1. Load trip; 404 if not found
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # 2. Must be finalized
    if trip.status != "finalized":
        raise HTTPException(status_code=404, detail="Trip not finalized")

    # 3. Build summary

    # Dates
    if trip.trip_start and trip.trip_end:
        dates = f"{_fmt_date(trip.trip_start)} – {_fmt_date(trip.trip_end)}"
    else:
        dates = "TBD"

    # Destination
    dest_row = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    destination = "TBD"
    destination_region = ""
    if dest_row and dest_row.locked_destination:
        destination = dest_row.locked_destination.get("name", "TBD")
        destination_region = dest_row.locked_destination.get("region", "")

    # Members (joined, with a user account)
    joined_members = (
        db.query(TripMember)
        .filter(TripMember.trip_id == trip_id, TripMember.joined == "joined")
        .all()
    )
    member_user_ids = [m.user_id for m in joined_members if m.user_id is not None]
    members = []
    if member_user_ids:
        users = db.query(User).filter(User.id.in_(member_user_ids)).all()
        user_map = {u.id: (u.name or _email_to_display_name(u.email)) for u in users}
        members = [user_map[uid] for uid in member_user_ids if uid in user_map]

    # Rounds
    rounds_db = (
        db.query(TripRound)
        .filter(TripRound.trip_id == trip_id)
        .order_by(TripRound.round_number)
        .all()
    )
    rounds = []
    for r in rounds_db:
        course = {
            "round_id": r.id,
            "round_number": r.round_number,
            "tier": r.tier,
            "tee_time": r.tee_time,
            "round_date": str(r.round_date) if r.round_date else None,
            "booked": bool(r.booked),
            "confirmation_number": r.confirmation_number,
            "course_name": "TBD",
            "course_location": "",
            "green_fee": None,
            "cart_fee": None,
            "rating": None,
            "slope": None,
            "par": None,
            "walking_policy": None,
            "architect": None,
            "pace_of_play": None,
            "tee_time_window": None,
            "website": None,
            "rating_source": None,
            "ranking": None,
            "yardage_options": None,
        }
        if r.locked_course_id:
            nomination = db.query(CourseNomination).filter(
                CourseNomination.id == r.locked_course_id
            ).first()
            if nomination and nomination.course_data:
                cd = nomination.course_data
                course["course_name"] = cd.get("name", "TBD")
                course["course_location"] = cd.get("location", "")
                gf = cd.get("green_fee")
                course["green_fee"] = float(gf) if gf is not None else None
                cf = cd.get("cart_fee")
                course["cart_fee"] = float(cf) if cf is not None else None
                course["rating"] = cd.get("rating")
                course["slope"] = cd.get("slope")
                course["par"] = cd.get("par")
                course["walking_policy"] = cd.get("walking_policy")
                course["architect"] = cd.get("architect")
                course["pace_of_play"] = cd.get("pace_of_play")
                course["tee_time_window"] = cd.get("tee_time_window")
                course["website"] = cd.get("website") or None
                course["rating_source"] = cd.get("rating_source") or None
                course["ranking"] = cd.get("ranking") or None
                course["yardage_options"] = cd.get("yardage_options")
        rounds.append(course)

    # Lodging — collect all options with is_locked=True
    def _build_lodging_data(option):
        od = option.option_data
        ppn = od.get("price_per_night")
        return {
            "option_id": option.id,
            "name": od.get("name", "TBD"),
            "type": od.get("type", ""),
            "price_per_night": float(ppn) if ppn is not None else None,
            "address": od.get("address") or od.get("location") or None,
            "beds": od.get("beds"),
            "rooms": od.get("rooms"),
            "capacity": od.get("capacity"),
            "distance_to_courses": od.get("distance_to_courses"),
            "amenities": od.get("amenities"),
            "booking_link": od.get("booking_link") or None,
            "website": od.get("website") or od.get("booking_link") or None,
            "notes": od.get("notes") or None,
        }

    locked_options = db.query(LodgingOption).filter(
        LodgingOption.trip_id == trip_id,
        LodgingOption.is_locked == True,
    ).all()

    # Backward compat: fall back to trip.locked_lodging_option_id if no is_locked options found
    if not locked_options and trip.locked_lodging_option_id:
        fallback = db.query(LodgingOption).filter(
            LodgingOption.id == trip.locked_lodging_option_id
        ).first()
        if fallback:
            locked_options = [fallback]

    lodging = _build_lodging_data(locked_options[0]) if locked_options else None
    lodging_all_locked = [_build_lodging_data(o) for o in locked_options] if locked_options else []

    # Add notes to rounds
    for course in rounds:
        r_obj = next((r for r in rounds_db if r.id == course["round_id"]), None)
        course["notes"] = getattr(r_obj, "notes", None) if r_obj else None

    # Per-person cost calculation
    nights = (trip.trip_end - trip.trip_start).days if trip.trip_start and trip.trip_end else 0
    member_count = len(joined_members)
    total_course_per_person = sum((c.get("green_fee") or 0) + (c.get("cart_fee") or 0) for c in rounds)
    lodging_per_person = 0.0
    if locked_options and nights:
        ppn = (locked_options[0].option_data or {}).get("price_per_night") or 0
        lodging_per_person = float(ppn) * nights / max(member_count, 1)
    total_per_person = total_course_per_person + lodging_per_person

    # Restaurant picks (sorted by most up-votes first per round)
    picks_raw = db.execute(
        text("SELECT * FROM restaurant_picks WHERE trip_id = :tid AND deleted_at IS NULL ORDER BY created_at"),
        {"tid": trip_id},
    ).fetchall()
    votes_raw = db.execute(
        text("""
            SELECT rv.pick_id, rv.user_name, rv.vote
            FROM restaurant_votes rv
            JOIN restaurant_picks rp ON rp.id = rv.pick_id
            WHERE rp.trip_id = :tid
        """),
        {"tid": trip_id},
    ).fetchall() if picks_raw else []

    votes_by_pick = {}
    for v in votes_raw:
        votes_by_pick.setdefault(v.pick_id, []).append({"user_name": v.user_name, "vote": v.vote})

    def _build_pick(p):
        vs = votes_by_pick.get(p.id, [])
        return {
            "id": p.id, "name": p.name, "cuisine": p.cuisine,
            "price_range": p.price_range, "vibe": p.vibe, "reason": p.reason,
            "address": p.address, "phone": p.phone, "maps_url": p.maps_url,
            "up_votes": [v["user_name"] for v in vs if v["vote"] == "up"],
        }

    restaurant_by_round = {}
    restaurant_lodging_picks = []
    for p in picks_raw:
        pd = _build_pick(p)
        if p.round_id is None:
            restaurant_lodging_picks.append(pd)
        else:
            restaurant_by_round.setdefault(p.round_id, []).append(pd)

    # Sort each round's picks by up-vote count desc and attach to round dicts
    for course in rounds:
        picks = sorted(restaurant_by_round.get(course["round_id"], []), key=lambda x: len(x["up_votes"]), reverse=True)
        course["restaurant_picks"] = picks

    restaurant_lodging_picks.sort(key=lambda x: len(x["up_votes"]), reverse=True)

    return {
        "trip_id": trip.id,
        "trip_name": trip.name,
        "dates": dates,
        "destination": destination,
        "destination_region": destination_region,
        "members": members,
        "member_count": member_count,
        "nights": nights,
        "rounds": rounds,
        "lodging": lodging,
        "lodging_all_locked": lodging_all_locked,
        "lodging_booked": bool(trip.lodging_booked),
        "lodging_confirmation": trip.lodging_confirmation,
        "lodging_per_person": round(lodging_per_person, 2) if lodging_per_person else None,
        "total_course_per_person": round(total_course_per_person, 2) if total_course_per_person else None,
        "total_per_person": round(total_per_person, 2) if total_per_person else None,
        "share_tagline": trip.share_tagline or None,
        "share_token": trip.share_token,
        "trip_start": trip.trip_start.isoformat() if trip.trip_start else None,
        "trip_end": trip.trip_end.isoformat() if trip.trip_end else None,
        "restaurant_lodging_picks": restaurant_lodging_picks,
    }


@router.post("/{trip_id}/tagline")
def create_share_tagline(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate (or regenerate) the AI trip summary narrative and save it."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip or trip.status != "finalized":
        raise HTTPException(status_code=404, detail="Trip not found or not finalized")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user.id,
        TripMember.joined == "joined",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    # Gather context
    dest_row = db.query(DestinationSuggestion).filter(DestinationSuggestion.trip_id == trip_id).first()
    destination = dest_row.locked_destination.get("name", "") if dest_row and dest_row.locked_destination else ""

    dates = ""
    if trip.trip_start and trip.trip_end:
        dates = f"{trip.trip_start.strftime('%b %d')} – {trip.trip_end.strftime('%b %d, %Y')}"

    joined = db.query(TripMember).filter(TripMember.trip_id == trip_id, TripMember.joined == "joined").all()
    user_ids = [m.user_id for m in joined if m.user_id]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    members = [u.name or u.email.split("@")[0].title() for u in users]

    rounds_db = db.query(TripRound).filter(TripRound.trip_id == trip_id).order_by(TripRound.round_number).all()
    rounds = []
    for r in rounds_db:
        if r.locked_course_id:
            nom = db.query(CourseNomination).filter(CourseNomination.id == r.locked_course_id).first()
            if nom and nom.course_data:
                rounds.append({"course_name": nom.course_data.get("name", "")})

    locked_lodging = db.query(LodgingOption).filter(
        LodgingOption.trip_id == trip_id, LodgingOption.is_locked == True
    ).first()
    lodging_name = (locked_lodging.option_data or {}).get("name") if locked_lodging else None

    tagline = generate_trip_tagline(trip.name, destination, dates, members, rounds, lodging_name)
    trip.share_tagline = tagline
    db.commit()
    return {"tagline": tagline}
