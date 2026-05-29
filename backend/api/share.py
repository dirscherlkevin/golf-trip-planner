from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.trip import Trip, TripMember
from models.user import User
from models.destination import DestinationSuggestion
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption

router = APIRouter()


@router.get("/{trip_id}")
def get_trip_share(trip_id: int, db: Session = Depends(get_db)):
    # 1. Load trip; 404 if not found
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # 2. Must be finalized
    if trip.status != "finalized":
        raise HTTPException(status_code=404, detail="Trip not finalized")

    # 3. Build summary

    # Dates
    if trip.trip_start and trip.trip_end:
        dates = f"{trip.trip_start} – {trip.trip_end}"
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
        user_map = {u.id: u.email for u in users}
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
        course_name = "TBD"
        course_location = ""
        green_fee = None
        website = None
        if r.locked_course_id:
            nomination = db.query(CourseNomination).filter(
                CourseNomination.id == r.locked_course_id
            ).first()
            if nomination and nomination.course_data:
                cd = nomination.course_data
                course_name = cd.get("name", "TBD")
                course_location = cd.get("location", "")
                gf = cd.get("green_fee")
                green_fee = float(gf) if gf is not None else None
                website = cd.get("website") or None
        rounds.append({
            "round_number": r.round_number,
            "tier": r.tier,
            "course_name": course_name,
            "course_location": course_location,
            "green_fee": green_fee,
            "website": website,
        })

    # Lodging
    lodging = None
    if trip.locked_lodging_option_id:
        option = db.query(LodgingOption).filter(
            LodgingOption.id == trip.locked_lodging_option_id
        ).first()
        if option and option.option_data:
            od = option.option_data
            ppn = od.get("price_per_night")
            lodging = {
                "name": od.get("name", "TBD"),
                "type": od.get("type", ""),
                "price_per_night": float(ppn) if ppn is not None else None,
                "booking_link": od.get("booking_link") or None,
            }

    return {
        "trip_id": trip.id,
        "trip_name": trip.name,
        "dates": dates,
        "destination": destination,
        "destination_region": destination_region,
        "members": members,
        "rounds": rounds,
        "lodging": lodging,
    }
