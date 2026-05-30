from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.phase import PhaseName
from models.trip import Trip, TripStatus
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


@router.post("/{trip_id}/lock")
def lock_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if trip.organizer_id != user.id:
        raise HTTPException(403, "Only the organizer can lock the trip")
    if trip.status == TripStatus.finalized:
        return {"status": "finalized", "trip_id": trip_id}

    # Validate all rounds locked (if any exist)
    from models.round import TripRound
    rounds = db.query(TripRound).filter(TripRound.trip_id == trip_id).all()
    if rounds and any(r.locked_course_id is None for r in rounds):
        raise HTTPException(400, "All rounds must be locked before finalizing")

    # Validate lodging locked (if lodging was set up)
    from models.lodging import LodgingSetup
    lodging_setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if lodging_setup and trip.locked_lodging_option_id is None:
        raise HTTPException(400, "Lodging must be locked before finalizing")

    # Lock the locked_in phase (validates phase is open)
    lock_phase(trip_id, PhaseName.locked_in, user.id, db)

    # Finalize the trip
    trip.status = TripStatus.finalized

    # Delete destination course cache (no longer needed after finalize)
    from models.round import DestinationCourseCache
    db.query(DestinationCourseCache).filter(DestinationCourseCache.trip_id == trip_id).delete()

    db.commit()
    db.refresh(trip)

    # Enqueue trip_summary emails for all joined members
    from models.trip import TripMember
    from models.destination import DestinationSuggestion
    from models.lodging import LodgingOption
    from models.round import CourseNomination
    from services.email import enqueue_email

    destination_name = "TBD"
    suggestion = db.query(DestinationSuggestion).filter(DestinationSuggestion.trip_id == trip_id).first()
    if suggestion and suggestion.locked_destination:
        destination_name = suggestion.locked_destination.get("name", "TBD")

    lodging_name = "TBD"
    if trip.locked_lodging_option_id:
        opt = db.query(LodgingOption).filter(LodgingOption.id == trip.locked_lodging_option_id).first()
        if opt and opt.option_data:
            lodging_name = opt.option_data.get("name", "TBD")

    course_names = []
    for r in rounds:
        if r.locked_course_id:
            nom = db.query(CourseNomination).filter(CourseNomination.id == r.locked_course_id).first()
            if nom and nom.course_data:
                course_names.append(nom.course_data.get("name", "?"))

    dates = ""
    if trip.trip_start and trip.trip_end:
        dates = f"{trip.trip_start} – {trip.trip_end}"

    members = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined",
        TripMember.user_id.isnot(None),
    ).all()

    from models.user import User as UserModel
    from services.email import _email_to_display_name, _base_url
    for member in members:
        member_user = db.query(UserModel).filter(UserModel.id == member.user_id).first()
        enqueue_email(db, trip_id, member.user_id, "trip_summary", {
            "trip_name": trip.name,
            "name": _email_to_display_name(member_user.email) if member_user else "Golfer",
            "dates": dates,
            "destination": destination_name,
            "courses": ", ".join(course_names) if course_names else "TBD",
            "lodging_name": lodging_name,
            "url": f"{_base_url()}/trips/{trip_id}",
        })

    return {"status": "finalized", "trip_id": trip_id}
