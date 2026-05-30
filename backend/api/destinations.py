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
    GenerateDestinationsIn, NominateDestinationIn, PreviewCoursesIn, VoteIn, LockDestinationIn,
    DestinationSuggestionOut, DestinationVoteTally, DestinationSuggestionWithVotesOut
)
from services.phases import get_phase, lock_phase, reopen_phase
from services.claude import generate_destinations, preview_destination_courses, enrich_destination
from models.round import DestinationCourseCache
from datetime import datetime, timezone, timedelta
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

    # Save settings to trip for Phase 3 reference
    if body.planned_rounds and body.planned_rounds > 0:
        trip.planned_rounds = body.planned_rounds
    trip.public_courses_only = body.public_courses_only
    db.flush()

    # Create or update the suggestion row
    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    is_new = suggestion is None
    if is_new:
        suggestion = DestinationSuggestion(trip_id=trip_id)
        db.add(suggestion)
        db.flush()

    # FIX 1: Guard against concurrent generate calls — if already pending, return current state
    # (only applies to existing rows, not newly created ones)
    if not is_new and suggestion.generation_status == GenerationStatus.pending:
        db.commit()
        db.refresh(suggestion)
        return suggestion  # return 200 with current pending state — client already shows loading

    suggestion.generation_status = GenerationStatus.pending
    suggestion.prompt_inputs = {
        "skill_mix": body.skill_mix,
        "tier_filter": body.tier_filter,
        "country": body.country,
        "region": body.region,
        "trip_start": str(trip.trip_start),
        "trip_end": str(trip.trip_end),
        "group_size": group_size,
        "planned_rounds": body.planned_rounds,
        "_started_at": datetime.now(timezone.utc).isoformat(),
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
            planned_rounds=body.planned_rounds,
            region=body.region,
            public_courses_only=body.public_courses_only,
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

    # FIX 2b: Auto-reset stuck pending rows (e.g., killed by proxy timeout)
    if suggestion.generation_status == GenerationStatus.pending:
        started_at_str = (suggestion.prompt_inputs or {}).get("_started_at")
        if started_at_str:
            started_at = datetime.fromisoformat(started_at_str)
            if datetime.now(timezone.utc) - started_at > timedelta(minutes=3):
                suggestion.generation_status = GenerationStatus.failed
                suggestion.prompt_inputs = {**suggestion.prompt_inputs, "error": "Generation timed out"}
                db.commit()
                db.refresh(suggestion)

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

    # FIX 4: Bounds check — ensure suggestions exist and index is valid
    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion or suggestion.generation_status != GenerationStatus.complete:
        raise HTTPException(status_code=400, detail="No complete suggestions available to vote on")
    if body.destination_index < 0 or body.destination_index >= len(suggestion.suggestions or []):
        raise HTTPException(status_code=400, detail="Invalid destination index")

    existing = db.query(DestinationVote).filter(
        DestinationVote.trip_id == trip_id,
        DestinationVote.user_id == user.id,
        DestinationVote.destination_index == body.destination_index,
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


@router.post("/{trip_id}/destinations/nominate", response_model=DestinationSuggestionOut)
def nominate_destination(
    trip_id: int,
    body: NominateDestinationIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can add destination nominations")

    phase = get_phase(trip_id, PhaseName.destination, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail="Destination phase is not open")

    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion:
        suggestion = DestinationSuggestion(
            trip_id=trip_id,
            generation_status=GenerationStatus.complete,
            suggestions=[],
        )
        db.add(suggestion)
        db.flush()

    base_dest = {
        "name": body.name.strip(),
        "region": body.region.strip(),
        "why_it_fits": body.why_it_fits.strip() or None,
        "top_courses": [],
        "est_cost_per_person_rounds": body.est_cost_per_person_rounds,
        "booking_warning": None,
    }

    # Enrich with AI — fills in why_it_fits, top_courses, est_cost, booking_warning
    try:
        enriched = enrich_destination(body.name.strip(), body.region.strip(), trip.planned_rounds or 3)
        # User-supplied non-empty values take priority; empty list/None don't override enriched data
        user_overrides = {k: v for k, v in base_dest.items() if v is not None and v != [] and v != ""}
        new_dest = {**enriched, **user_overrides}
    except Exception:
        new_dest = {**base_dest, "why_it_fits": base_dest["why_it_fits"] or "Manually added by organizer."}

    current = list(suggestion.suggestions or [])
    current.append(new_dest)
    suggestion.suggestions = current
    if suggestion.generation_status != GenerationStatus.complete:
        suggestion.generation_status = GenerationStatus.complete

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(suggestion, "suggestions")
    db.commit()
    db.refresh(suggestion)
    return suggestion


@router.delete("/{trip_id}/destinations/lock", response_model=DestinationSuggestionOut)
def unlock_destination(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can unlock the destination")

    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion or not suggestion.locked_destination:
        raise HTTPException(status_code=400, detail="No destination is locked")

    suggestion.locked_destination = None
    db.flush()

    # Reopen destination phase (sets planning back to pending) only if currently locked
    dest_phase = get_phase(trip_id, PhaseName.destination, db)
    if dest_phase.status == PhaseStatus.locked:
        reopen_phase(trip_id, PhaseName.destination, user.id, db)

    db.commit()
    db.refresh(suggestion)
    return suggestion


@router.post("/{trip_id}/destinations/preview-courses")
def preview_courses(
    trip_id: int,
    body: PreviewCoursesIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    try:
        courses = preview_destination_courses(
            destination_name=body.destination_name,
            region=body.region,
            planned_rounds=body.planned_rounds,
        )
        # Cache courses so Phase 3 can reuse them without regenerating
        cache_row = db.query(DestinationCourseCache).filter(
            DestinationCourseCache.trip_id == trip_id,
            DestinationCourseCache.destination_name == body.destination_name,
        ).first()
        if cache_row:
            cache_row.courses = courses
        else:
            db.add(DestinationCourseCache(trip_id=trip_id, destination_name=body.destination_name, courses=courses))
        from sqlalchemy.orm.attributes import flag_modified
        if cache_row:
            flag_modified(cache_row, "courses")
        db.commit()
        return {"courses": courses}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate course preview: {str(e)}")


@router.delete("/{trip_id}/destinations/nominations/{dest_index}", response_model=DestinationSuggestionOut)
def remove_destination_nomination(
    trip_id: int,
    dest_index: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can remove destination nominations")

    phase = get_phase(trip_id, PhaseName.destination, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail="Destination phase is not open")

    suggestion = db.query(DestinationSuggestion).filter(
        DestinationSuggestion.trip_id == trip_id
    ).first()
    if not suggestion or not suggestion.suggestions:
        raise HTTPException(status_code=404, detail="No destination suggestions found")
    if dest_index < 0 or dest_index >= len(suggestion.suggestions):
        raise HTTPException(status_code=400, detail="Invalid destination index")

    current = list(suggestion.suggestions)
    current.pop(dest_index)
    suggestion.suggestions = current

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(suggestion, "suggestions")

    # Remove votes for this index and shift higher votes down
    votes = db.query(DestinationVote).filter(DestinationVote.trip_id == trip_id).all()
    for v in votes:
        if v.destination_index == dest_index:
            db.delete(v)
        elif v.destination_index > dest_index:
            v.destination_index -= 1

    db.commit()
    db.refresh(suggestion)
    return suggestion
