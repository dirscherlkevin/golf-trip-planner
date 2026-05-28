from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.trip import Trip, TripMember
from models.destination import DestinationSuggestion, DestinationVote, GenerationStatus
from models.phase import PhaseName, PhaseStatus
from models.decision import TripDecision, DecisionType
from schemas.destination import (
    GenerateDestinationsIn, VoteIn, LockDestinationIn,
    DestinationSuggestionOut, DestinationVoteTally, DestinationSuggestionWithVotesOut
)
from services.phases import get_phase, lock_phase
from services.claude import generate_destinations
from datetime import datetime, timezone
import statistics

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

def _get_budget_from_availability(trip_id: int, db: Session) -> tuple[float | None, float | None]:
    from models.availability import AvailabilityResponse
    responses = db.query(AvailabilityResponse).filter(
        AvailabilityResponse.trip_id == trip_id
    ).all()
    happy_vals = [float(r.happy_spend) for r in responses if r.happy_spend is not None]
    hard_vals = [float(r.hard_limit) for r in responses if r.hard_limit is not None]
    median_happy = statistics.median(happy_vals) if happy_vals else None
    median_hard = statistics.median(hard_vals) if hard_vals else None
    return median_happy, median_hard

def _build_vote_tallies(trip_id: int, user_id: int, num_suggestions: int, db: Session) -> list[DestinationVoteTally]:
    votes = db.query(DestinationVote).filter(DestinationVote.trip_id == trip_id).all()
    tallies = []
    for i in range(num_suggestions):
        idx_votes = [v for v in votes if v.destination_index == i]
        up = sum(1 for v in idx_votes if v.vote == "up")
        down = sum(1 for v in idx_votes if v.vote == "down")
        my_vote = next((v.vote for v in idx_votes if v.user_id == user_id), None)
        tallies.append(DestinationVoteTally(destination_index=i, up_votes=up, down_votes=down, my_vote=my_vote))
    return tallies

@router.post("/{trip_id}/destinations/generate", response_model=DestinationSuggestionOut)
def generate_destination_suggestions(
    trip_id: int,
    body: GenerateDestinationsIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can generate destination suggestions")

    phase = get_phase(trip_id, PhaseName.destination, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail="Destination phase is not open")

    if not trip.trip_start or not trip.trip_end:
        raise HTTPException(status_code=400, detail="Trip dates must be locked before generating destinations")

    group_size = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.joined == "joined"
    ).count()

    budget_median, budget_max = _get_budget_from_availability(trip_id, db)

    # Create or update the suggestion row
    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion:
        suggestion = DestinationSuggestion(trip_id=trip_id)
        db.add(suggestion)

    suggestion.generation_status = GenerationStatus.pending
    suggestion.prompt_inputs = {
        "skill_mix": body.skill_mix,
        "tier_filter": body.tier_filter,
        "country": body.country,
        "trip_start": str(trip.trip_start),
        "trip_end": str(trip.trip_end),
        "group_size": group_size,
    }
    db.commit()
    db.refresh(suggestion)

    # Call Claude synchronously (kept simple for now)
    try:
        results = generate_destinations(
            trip_start=str(trip.trip_start),
            trip_end=str(trip.trip_end),
            group_size=group_size,
            skill_mix=body.skill_mix,
            budget_median=budget_median,
            budget_max=budget_max,
            country=body.country,
            tier_filter=body.tier_filter,
        )
        suggestion.suggestions = results
        suggestion.generation_status = GenerationStatus.complete
        suggestion.generated_at = datetime.now(timezone.utc)
    except Exception as e:
        suggestion.generation_status = GenerationStatus.failed
        suggestion.prompt_inputs = {**suggestion.prompt_inputs, "error": str(e)}

    db.commit()
    db.refresh(suggestion)
    return suggestion

@router.get("/{trip_id}/destinations", response_model=DestinationSuggestionWithVotesOut)
def get_destination_suggestions(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="No destination suggestions generated yet")

    num = len(suggestion.suggestions) if suggestion.suggestions else 0
    tallies = _build_vote_tallies(trip_id, user.id, num, db)

    return DestinationSuggestionWithVotesOut(
        suggestion=DestinationSuggestionOut.model_validate(suggestion),
        vote_tallies=tallies,
    )

@router.post("/{trip_id}/destinations/vote", status_code=204)
def vote_on_destination(
    trip_id: int,
    body: VoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    if body.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")

    phase = get_phase(trip_id, PhaseName.destination, db)
    if phase.status == PhaseStatus.locked:
        raise HTTPException(status_code=409, detail="Destination phase is locked")

    existing = db.query(DestinationVote).filter(
        DestinationVote.trip_id == trip_id,
        DestinationVote.user_id == user.id,
    ).first()
    if existing:
        existing.destination_index = body.destination_index
        existing.vote = body.vote
    else:
        db.add(DestinationVote(
            trip_id=trip_id,
            user_id=user.id,
            destination_index=body.destination_index,
            vote=body.vote,
        ))
    db.commit()

@router.post("/{trip_id}/destinations/lock", response_model=DestinationSuggestionOut)
def lock_destination(
    trip_id: int,
    body: LockDestinationIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can lock a destination")

    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion or suggestion.generation_status != GenerationStatus.complete:
        raise HTTPException(status_code=400, detail="No complete suggestions available to lock")

    if body.destination_index >= len(suggestion.suggestions):
        raise HTTPException(status_code=400, detail="Invalid destination index")

    locked = suggestion.suggestions[body.destination_index]
    suggestion.locked_destination = locked
    db.flush()

    # Record decision and advance phase
    lock_phase(
        trip_id, PhaseName.destination, user.id, db,
        entity_id=suggestion.id, entity_type="destination_suggestion",
        override=body.override
    )
    db.commit()
    db.refresh(suggestion)
    return suggestion
