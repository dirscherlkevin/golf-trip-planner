import os
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.trip import Trip, TripMember
from models.lodging import LodgingSetup, LodgingOption, LodgingVote, LodgingType, LodgingGenerationStatus
from models.destination import DestinationSuggestion
from models.phase import PhaseName, PhaseStatus
from models.decision import TripDecision, DecisionType
from schemas.lodging import (
    LodgingSetupIn, LodgingNominateIn, VoteIn,
    LodgingSetupOut, LodgingOptionOut, LodgingVoteTally,
)
from services.phases import get_phase
from services.claude import generate_lodging, enrich_lodging
from datetime import datetime, timezone, timedelta

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter()


def _get_trip_member(trip_id: int, user_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.user_id == user_id,
        TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip


def _get_destination_name(trip_id: int, db: Session) -> str:
    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if suggestion:
        if suggestion.locked_destination:
            return suggestion.locked_destination.get("name", "Unknown Destination")
        # Fall back to first suggestion (e.g. manual destination not yet locked)
        if suggestion.suggestions:
            return suggestion.suggestions[0].get("name", "Unknown Destination")
    return "Unknown Destination"


def _get_locked_course_names(trip_id: int, db: Session) -> list[str]:
    """Get names of locked courses from trip rounds."""
    from models.round import TripRound, CourseNomination
    rounds = db.query(TripRound).filter(
        TripRound.trip_id == trip_id,
        TripRound.locked_course_id.isnot(None)
    ).all()
    names = []
    for r in rounds:
        nom = db.query(CourseNomination).filter(
            CourseNomination.id == r.locked_course_id
        ).first()
        if nom and nom.course_data:
            name = nom.course_data.get("name")
            if name:
                names.append(name)
    return names


def _build_option_out(opt: LodgingOption, user_id: int, db: Session) -> LodgingOptionOut:
    """Build a single option out — used for single-option responses (nominate)."""
    votes = db.query(LodgingVote).filter(LodgingVote.option_id == opt.id).all()
    up = sum(1 for v in votes if v.vote == "up")
    down = sum(1 for v in votes if v.vote == "down")
    my_vote = next((v.vote for v in votes if v.user_id == user_id), None)
    tally = LodgingVoteTally(option_id=opt.id, up_votes=up, down_votes=down, my_vote=my_vote)
    return LodgingOptionOut(
        id=opt.id,
        trip_id=opt.trip_id,
        lodging_type=opt.lodging_type.value,
        option_data=opt.option_data,
        added_by=opt.added_by,
        source=opt.source,
        vote_tally=tally,
    )


def _build_setup_out(setup: LodgingSetup, trip: Trip, user_id: int, db: Session) -> LodgingSetupOut:
    options = db.query(LodgingOption).filter(
        LodgingOption.trip_id == setup.trip_id
    ).order_by(LodgingOption.created_at).all()

    # Bulk-fetch all votes to avoid N+1 queries
    option_ids = [o.id for o in options]
    all_votes = db.query(LodgingVote).filter(
        LodgingVote.option_id.in_(option_ids)
    ).all() if option_ids else []

    option_outs = []
    for opt in options:
        votes = [v for v in all_votes if v.option_id == opt.id]
        up = sum(1 for v in votes if v.vote == "up")
        down = sum(1 for v in votes if v.vote == "down")
        my_vote = next((v.vote for v in votes if v.user_id == user_id), None)
        tally = LodgingVoteTally(option_id=opt.id, up_votes=up, down_votes=down, my_vote=my_vote)
        option_outs.append(LodgingOptionOut(
            id=opt.id,
            trip_id=opt.trip_id,
            lodging_type=opt.lodging_type.value,
            option_data=opt.option_data,
            added_by=opt.added_by,
            source=opt.source,
            vote_tally=tally,
        ))

    return LodgingSetupOut(
        lodging_type=setup.lodging_type.value,
        generation_status=setup.generation_status.value,
        options=option_outs,
        locked_option_id=trip.locked_lodging_option_id,
    )


def _generate_lodging_bg(
    trip_id: int,
    setup_id: int,
    destination: str,
    lodging_type: str,
    group_size: int,
    nights: int,
    course_names: list[str],
    db_url: str,
):
    """Background task to generate lodging options."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(db_url)
    BgSession = sessionmaker(bind=engine)
    db = BgSession()
    try:
        setup = db.query(LodgingSetup).filter(LodgingSetup.id == setup_id).first()
        if not setup:
            return
        try:
            options = generate_lodging(destination, lodging_type, group_size, nights, course_names)
            for opt_data in options:
                db.add(LodgingOption(
                    trip_id=trip_id,
                    lodging_type=LodgingType(lodging_type),
                    option_data=opt_data,
                    added_by=None,
                    source="ai",
                    generation_status=LodgingGenerationStatus.complete,
                ))
            setup.generation_status = LodgingGenerationStatus.complete
        except Exception as e:
            logger.exception("Lodging generation failed for setup_id=%s: %s", setup_id, e)
            setup.generation_status = LodgingGenerationStatus.failed
        db.commit()
    finally:
        db.close()


@router.post("/{trip_id}/lodging/setup", response_model=LodgingSetupOut)
def setup_lodging(
    trip_id: int,
    body: LodgingSetupIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can set up lodging")

    phase = get_phase(trip_id, PhaseName.planning, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail="Planning phase is not open")

    # Validate lodging_type
    try:
        lodging_type = LodgingType(body.lodging_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="lodging_type must be 'rental', 'hotel', or 'both'")

    # If setup already exists and failed, delete it so we can retry
    existing = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if existing:
        if existing.generation_status == LodgingGenerationStatus.failed:
            db.delete(existing)
            db.flush()
        else:
            raise HTTPException(status_code=409, detail="Lodging already set up for this trip")

    # Get destination name
    destination = _get_destination_name(trip_id, db)

    # Night count
    if trip.trip_start and trip.trip_end:
        nights = (trip.trip_end - trip.trip_start).days
    else:
        nights = 3

    # Group size
    group_size = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined"
    ).count()

    # Locked course names
    course_names = _get_locked_course_names(trip_id, db)

    # Create setup row
    setup = LodgingSetup(
        trip_id=trip_id,
        lodging_type=lodging_type,
        generation_status=LodgingGenerationStatus.pending,
        prompt_inputs={
            "destination": destination,
            "lodging_type": body.lodging_type,
            "group_size": group_size,
            "nights": nights,
            "course_names": course_names,
            "_started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(setup)
    db.commit()
    db.refresh(setup)

    db_url = os.getenv("DATABASE_URL")

    background_tasks.add_task(
        _generate_lodging_bg,
        trip_id, setup.id, destination, body.lodging_type, group_size, nights, course_names, db_url
    )

    return _build_setup_out(setup, trip, user.id, db)


@router.get("/{trip_id}/lodging", response_model=LodgingSetupOut)
def get_lodging(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Lodging not set up yet")

    # Auto-reset stuck pending setups after 3 minutes
    if setup.generation_status == LodgingGenerationStatus.pending:
        started_at_str = (setup.prompt_inputs or {}).get("_started_at")
        if started_at_str:
            started_at = datetime.fromisoformat(started_at_str)
            if datetime.now(timezone.utc) - started_at > timedelta(minutes=3):
                setup.generation_status = LodgingGenerationStatus.failed
                setup.prompt_inputs = {**setup.prompt_inputs, "error": "Generation timed out"}
                db.commit()
                db.refresh(setup)

    return _build_setup_out(setup, trip, user.id, db)


@router.post("/{trip_id}/lodging/generate-more", status_code=204)
def generate_more_lodging(
    trip_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can generate more lodging options")

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Lodging not set up yet")

    destination = _get_destination_name(trip_id, db)
    if trip.trip_start and trip.trip_end:
        nights = (trip.trip_end - trip.trip_start).days
    else:
        nights = 3
    group_size = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined"
    ).count()
    course_names = _get_locked_course_names(trip_id, db)

    setup.generation_status = LodgingGenerationStatus.pending
    setup.prompt_inputs = {
        **(setup.prompt_inputs or {}),
        "_started_at": datetime.now(timezone.utc).isoformat(),
    }
    db.commit()

    db_url = os.getenv("DATABASE_URL")

    background_tasks.add_task(
        _generate_lodging_bg,
        trip_id, setup.id, destination, setup.lodging_type.value, group_size, nights, course_names, db_url
    )


@router.post("/{trip_id}/lodging/nominate", response_model=LodgingOptionOut)
def nominate_lodging(
    trip_id: int,
    body: LodgingNominateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        # Auto-create a minimal setup row so manual nominations work without AI setup
        setup = LodgingSetup(
            trip_id=trip_id,
            lodging_type=LodgingType.both,
            generation_status=LodgingGenerationStatus.complete,
            prompt_inputs={},
        )
        db.add(setup)
        db.flush()
    if trip.locked_lodging_option_id is not None:
        raise HTTPException(status_code=409, detail="Lodging is already locked")

    # Enrich with AI — fills in price, beds, capacity, amenities, etc.
    option_data = dict(body.option_data)
    try:
        enriched = enrich_lodging(
            option_data.get("name", ""),
            option_data.get("address", ""),
            option_data.get("type", ""),
        )
        # User-supplied non-null values take priority
        user_values = {k: v for k, v in option_data.items() if v is not None and v != ""}
        option_data = {**enriched, **user_values}
    except Exception:
        pass  # Keep as-is if enrichment fails

    opt = LodgingOption(
        trip_id=trip_id,
        lodging_type=setup.lodging_type,
        option_data=option_data,
        added_by=user.id,
        source="manual",
        generation_status=LodgingGenerationStatus.complete,
    )
    db.add(opt)
    db.commit()
    db.refresh(opt)
    return _build_option_out(opt, user.id, db)


@router.post("/{trip_id}/lodging/options/{opt_id}/vote", status_code=204)
def vote_on_lodging(
    trip_id: int,
    opt_id: int,
    body: VoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if body.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")

    if trip.locked_lodging_option_id is not None:
        raise HTTPException(status_code=409, detail="Lodging is already locked")

    opt = db.query(LodgingOption).filter(
        LodgingOption.id == opt_id,
        LodgingOption.trip_id == trip_id,
    ).first()
    if not opt:
        raise HTTPException(status_code=404, detail="Lodging option not found")

    existing = db.query(LodgingVote).filter(
        LodgingVote.option_id == opt_id,
        LodgingVote.user_id == user.id,
    ).first()
    if existing:
        existing.vote = body.vote
    else:
        db.add(LodgingVote(option_id=opt_id, user_id=user.id, vote=body.vote))
    db.commit()


@router.post("/{trip_id}/lodging/options/{opt_id}/lock", response_model=LodgingSetupOut)
def lock_lodging(
    trip_id: int,
    opt_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can lock lodging")

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Lodging not set up yet")

    opt = db.query(LodgingOption).filter(
        LodgingOption.id == opt_id,
        LodgingOption.trip_id == trip_id,
    ).first()
    if not opt:
        raise HTTPException(status_code=404, detail="Lodging option not found")

    trip.locked_lodging_option_id = opt_id
    db.flush()

    db.add(TripDecision(
        trip_id=trip_id,
        decision_type=DecisionType.lodging_locked,
        entity_id=opt_id,
        entity_type="lodging_option",
        decided_by=user.id,
        override=False,
    ))
    db.commit()
    db.refresh(trip)

    return _build_setup_out(setup, trip, user.id, db)


@router.delete("/{trip_id}/lodging/options/{opt_id}", response_model=LodgingSetupOut)
def remove_lodging_option(
    trip_id: int,
    opt_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can remove lodging options")

    if trip.locked_lodging_option_id == opt_id:
        raise HTTPException(status_code=409, detail="Cannot remove the locked lodging option — unlock lodging first")

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Lodging not set up yet")

    opt = db.query(LodgingOption).filter(
        LodgingOption.id == opt_id, LodgingOption.trip_id == trip_id
    ).first()
    if not opt:
        raise HTTPException(status_code=404, detail="Lodging option not found")

    db.query(LodgingVote).filter(LodgingVote.option_id == opt_id).delete()
    db.delete(opt)
    db.commit()
    db.refresh(trip)
    return _build_setup_out(setup, trip, user.id, db)


@router.delete("/{trip_id}/lodging/lock", response_model=LodgingSetupOut)
def unlock_lodging(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can unlock lodging")

    if trip.locked_lodging_option_id is None:
        raise HTTPException(status_code=400, detail="Lodging is not locked")

    setup = db.query(LodgingSetup).filter(LodgingSetup.trip_id == trip_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Lodging not set up yet")

    trip.locked_lodging_option_id = None
    db.commit()
    db.refresh(trip)

    return _build_setup_out(setup, trip, user.id, db)
