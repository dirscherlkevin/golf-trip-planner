from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.trip import Trip, TripMember
from models.round import TripRound, CourseNomination, CourseVote, RoundTier, RoundGenerationStatus, NominationSource
from models.destination import DestinationSuggestion
from models.phase import PhaseName, PhaseStatus
from schemas.round import (
    RoundSetupIn, CourseNominateIn, VoteIn, LockCourseIn,
    TripRoundOut, CourseNominationOut, CourseVoteTally
)
from services.phases import get_phase, lock_phase
from services.claude import generate_courses_for_round
from datetime import datetime, timezone

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
    if suggestion and suggestion.locked_destination:
        return suggestion.locked_destination.get("name", "Unknown Destination")
    return "Unknown Destination"

def _build_round_with_nominations(trip_round: TripRound, user_id: int, db: Session) -> TripRoundOut:
    nominations = db.query(CourseNomination).filter(
        CourseNomination.round_id == trip_round.id
    ).order_by(CourseNomination.created_at).all()

    all_votes = db.query(CourseVote).filter(
        CourseVote.nomination_id.in_([n.id for n in nominations])
    ).all() if nominations else []

    nom_outs = []
    for n in nominations:
        n_votes = [v for v in all_votes if v.nomination_id == n.id]
        up = sum(1 for v in n_votes if v.vote == "up")
        down = sum(1 for v in n_votes if v.vote == "down")
        my_vote = next((v.vote for v in n_votes if v.user_id == user_id), None)
        tally = CourseVoteTally(nomination_id=n.id, up_votes=up, down_votes=down, my_vote=my_vote)
        nom_outs.append(CourseNominationOut(
            id=n.id,
            round_id=n.round_id,
            course_data=n.course_data,
            nominated_by=n.nominated_by,
            source=n.source.value,
            vote_tally=tally,
        ))

    return TripRoundOut(
        id=trip_round.id,
        trip_id=trip_round.trip_id,
        round_number=trip_round.round_number,
        tier=trip_round.tier,
        generation_status=trip_round.generation_status,
        locked_course_id=trip_round.locked_course_id,
        nominations=nom_outs,
    )

def _generate_courses_for_round_bg(trip_round_id: int, destination: str, tier: str, db_url: str):
    """Background task to generate courses for a round."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(db_url)
    BgSession = sessionmaker(bind=engine)
    db = BgSession()
    try:
        trip_round = db.query(TripRound).filter(TripRound.id == trip_round_id).first()
        if not trip_round:
            return
        existing_names = [
            n.course_data.get("name", "")
            for n in db.query(CourseNomination).filter(
                CourseNomination.round_id == trip_round_id
            ).all()
        ]
        try:
            courses = generate_courses_for_round(destination, tier, trip_round.round_number, existing_names)
            for course in courses:
                db.add(CourseNomination(
                    round_id=trip_round_id,
                    trip_id=trip_round.trip_id,
                    course_data=course,
                    nominated_by=None,
                    source=NominationSource.ai,
                ))
            trip_round.generation_status = RoundGenerationStatus.complete
        except Exception as e:
            trip_round.generation_status = RoundGenerationStatus.failed
        db.commit()
    finally:
        db.close()

@router.post("/{trip_id}/rounds/setup", response_model=list[TripRoundOut])
def setup_rounds(
    trip_id: int,
    body: RoundSetupIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can set up rounds")

    phase = get_phase(trip_id, PhaseName.planning, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail="Planning phase is not open")

    # Don't allow re-setup if rounds already exist
    existing = db.query(TripRound).filter(TripRound.trip_id == trip_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Rounds already set up for this trip")

    destination = _get_destination_name(trip_id, db)

    import os
    from dotenv import load_dotenv
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")

    created_rounds = []
    for r in sorted(body.rounds, key=lambda x: x.round_number):
        trip_round = TripRound(
            trip_id=trip_id,
            round_number=r.round_number,
            tier=r.tier,
            generation_status=RoundGenerationStatus.pending,
        )
        db.add(trip_round)
        db.flush()
        created_rounds.append(trip_round)
        background_tasks.add_task(
            _generate_courses_for_round_bg,
            trip_round.id, destination, r.tier.value, db_url
        )

    db.commit()

    return [_build_round_with_nominations(r, user.id, db) for r in created_rounds]

@router.get("/{trip_id}/rounds", response_model=list[TripRoundOut])
def get_rounds(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    rounds = db.query(TripRound).filter(TripRound.trip_id == trip_id).order_by(TripRound.round_number).all()
    return [_build_round_with_nominations(r, user.id, db) for r in rounds]

@router.post("/{trip_id}/rounds/{round_id}/generate-more", status_code=204)
def generate_more_courses(
    trip_id: int,
    round_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can generate more courses")

    trip_round = db.query(TripRound).filter(
        TripRound.id == round_id, TripRound.trip_id == trip_id
    ).first()
    if not trip_round:
        raise HTTPException(status_code=404, detail="Round not found")

    destination = _get_destination_name(trip_id, db)

    import os
    from dotenv import load_dotenv
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")

    trip_round.generation_status = RoundGenerationStatus.pending
    db.commit()
    background_tasks.add_task(
        _generate_courses_for_round_bg,
        round_id, destination, trip_round.tier.value, db_url
    )

@router.post("/{trip_id}/rounds/{round_id}/nominate", response_model=CourseNominationOut)
def nominate_course(
    trip_id: int,
    round_id: int,
    body: CourseNominateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    trip_round = db.query(TripRound).filter(
        TripRound.id == round_id, TripRound.trip_id == trip_id
    ).first()
    if not trip_round:
        raise HTTPException(status_code=404, detail="Round not found")
    if trip_round.locked_course_id is not None:
        raise HTTPException(status_code=409, detail="Round is already locked")

    nom = CourseNomination(
        round_id=round_id,
        trip_id=trip_id,
        course_data=body.course_data,
        nominated_by=user.id,
        source=NominationSource.manual,
    )
    db.add(nom)
    db.commit()
    db.refresh(nom)
    return CourseNominationOut(
        id=nom.id, round_id=nom.round_id, course_data=nom.course_data,
        nominated_by=nom.nominated_by, source=nom.source.value,
        vote_tally=CourseVoteTally(nomination_id=nom.id, up_votes=0, down_votes=0),
    )

@router.post("/{trip_id}/rounds/{round_id}/nominations/{nom_id}/vote", status_code=204)
def vote_on_course(
    trip_id: int,
    round_id: int,
    nom_id: int,
    body: VoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    if body.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")

    nom = db.query(CourseNomination).filter(
        CourseNomination.id == nom_id, CourseNomination.round_id == round_id
    ).first()
    if not nom:
        raise HTTPException(status_code=404, detail="Nomination not found")

    trip_round = db.query(TripRound).filter(TripRound.id == round_id).first()
    if trip_round and trip_round.locked_course_id is not None:
        raise HTTPException(status_code=409, detail="Round is already locked")

    existing = db.query(CourseVote).filter(
        CourseVote.nomination_id == nom_id, CourseVote.user_id == user.id
    ).first()
    if existing:
        existing.vote = body.vote
    else:
        db.add(CourseVote(nomination_id=nom_id, user_id=user.id, vote=body.vote))
    db.commit()

@router.post("/{trip_id}/rounds/{round_id}/lock", response_model=TripRoundOut)
def lock_round(
    trip_id: int,
    round_id: int,
    body: LockCourseIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can lock a round")

    trip_round = db.query(TripRound).filter(
        TripRound.id == round_id, TripRound.trip_id == trip_id
    ).first()
    if not trip_round:
        raise HTTPException(status_code=404, detail="Round not found")
    if trip_round.locked_course_id is not None:
        raise HTTPException(status_code=409, detail="Round already locked")

    nom = db.query(CourseNomination).filter(
        CourseNomination.id == body.nomination_id,
        CourseNomination.round_id == round_id
    ).first()
    if not nom:
        raise HTTPException(status_code=404, detail="Nomination not found for this round")

    trip_round.locked_course_id = body.nomination_id
    db.flush()

    # Record decision
    from models.decision import TripDecision, DecisionType
    db.add(TripDecision(
        trip_id=trip_id,
        decision_type=DecisionType.round_locked,
        entity_id=body.nomination_id,
        entity_type="course_nomination",
        decided_by=user.id,
        override=body.override,
    ))
    db.flush()

    # Check if all rounds are locked → check phase 4 readiness
    all_rounds = db.query(TripRound).filter(TripRound.trip_id == trip_id).all()
    all_locked = all(r.locked_course_id is not None for r in all_rounds)
    # Phase 4 readiness check will be done when both rounds AND lodging are locked
    # (handled in the lock endpoint for lodging / trip finalization)

    db.commit()
    return _build_round_with_nominations(trip_round, user.id, db)
