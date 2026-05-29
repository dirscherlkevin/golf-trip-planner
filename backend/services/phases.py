from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from models.phase import TripPhase, PhaseStatus, PhaseName
from models.decision import TripDecision, DecisionType
from models.trip import Trip

PHASE_ORDER = [PhaseName.availability, PhaseName.destination, PhaseName.planning, PhaseName.locked_in]
PHASE_TO_DECISION = {
    PhaseName.availability: DecisionType.date_locked,
    PhaseName.destination: DecisionType.destination_locked,
    PhaseName.planning: DecisionType.round_locked,  # planning lock is handled separately
    PhaseName.locked_in: DecisionType.trip_locked,
}


def get_phases(trip_id: int, db: Session) -> list[TripPhase]:
    """Return all 4 phase rows for a trip, ordered by PHASE_ORDER."""
    phases = db.query(TripPhase).filter(TripPhase.trip_id == trip_id).all()
    order_map = {p: i for i, p in enumerate(PHASE_ORDER)}
    return sorted(phases, key=lambda p: order_map[p.phase])


def get_phase(trip_id: int, phase_name: PhaseName, db: Session) -> TripPhase:
    """Return a single phase row. Raises 404 if not found."""
    phase = db.query(TripPhase).filter(
        TripPhase.trip_id == trip_id,
        TripPhase.phase == phase_name
    ).first()
    if not phase:
        raise HTTPException(status_code=404, detail=f"Phase {phase_name} not found for trip {trip_id}")
    return phase


def initialize_phases(trip_id: int, db: Session) -> None:
    """Create 4 phase rows for a new trip. Availability starts open; others start pending."""
    for phase_name in PHASE_ORDER:
        status = PhaseStatus.open if phase_name == PhaseName.availability else PhaseStatus.pending
        db.add(TripPhase(trip_id=trip_id, phase=phase_name, status=status))
    db.flush()


def lock_phase(
    trip_id: int,
    phase_name: PhaseName,
    user_id: int,
    db: Session,
    entity_id: int | None = None,
    entity_type: str | None = None,
    override: bool = False,
) -> TripPhase:
    """Lock a phase (organizer only). Opens the next phase. Creates a TripDecision row."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user_id:
        raise HTTPException(status_code=403, detail="Only the organizer can lock a phase")

    phase = get_phase(trip_id, phase_name, db)
    if phase.status != PhaseStatus.open:
        raise HTTPException(status_code=400, detail=f"Phase {phase_name} is not open (status: {phase.status})")

    phase.status = PhaseStatus.locked
    phase.locked_at = datetime.now(timezone.utc)
    phase.locked_by = user_id

    # Record the decision
    decision_type = PHASE_TO_DECISION.get(phase_name, DecisionType.trip_locked)
    db.add(TripDecision(
        trip_id=trip_id,
        decision_type=decision_type,
        entity_id=entity_id,
        entity_type=entity_type,
        decided_by=user_id,
        override=override,
    ))

    # Open next phase
    current_idx = PHASE_ORDER.index(phase_name)
    if current_idx + 1 < len(PHASE_ORDER):
        next_phase_name = PHASE_ORDER[current_idx + 1]
        next_phase = get_phase(trip_id, next_phase_name, db)
        next_phase.status = PhaseStatus.open

    db.flush()
    return phase


def reopen_phase(trip_id: int, phase_name: PhaseName, user_id: int, db: Session) -> TripPhase:
    """Re-open a locked phase. Only allowed if downstream phases haven't been acted upon.

    Rules:
    - availability: can reopen if no destination_suggestions rows exist for this trip
    - destination: can reopen if no trip_rounds rows exist for this trip
    - Other phases cannot be reopened via this function.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.organizer_id != user_id:
        raise HTTPException(status_code=403, detail="Only the organizer can reopen a phase")

    phase = get_phase(trip_id, phase_name, db)
    if phase.status != PhaseStatus.locked:
        raise HTTPException(status_code=400, detail=f"Phase {phase_name} is not locked")

    if phase_name == PhaseName.availability:
        # Can reopen if destination phase has not been acted upon.
        # Check that destination phase is open (not locked).
        dest_phase = get_phase(trip_id, PhaseName.destination, db)
        if dest_phase.status == PhaseStatus.locked:
            raise HTTPException(status_code=400, detail="Cannot reopen availability after destination is locked")
    elif phase_name == PhaseName.destination:
        # Can reopen if planning phase has not been acted upon.
        planning_phase = get_phase(trip_id, PhaseName.planning, db)
        if planning_phase.status == PhaseStatus.locked:
            raise HTTPException(status_code=400, detail="Cannot reopen destination after planning is locked")
    elif phase_name == PhaseName.planning:
        # Can reopen if the trip has not been finalized.
        lockin_phase = get_phase(trip_id, PhaseName.locked_in, db)
        if lockin_phase.status == PhaseStatus.locked:
            raise HTTPException(status_code=400, detail="Cannot reopen planning after trip is finalized")
    else:
        raise HTTPException(status_code=400, detail=f"Phase {phase_name} cannot be reopened")

    phase.status = PhaseStatus.open
    phase.locked_at = None
    phase.locked_by = None

    # Set the next phase back to pending
    current_idx = PHASE_ORDER.index(phase_name)
    if current_idx + 1 < len(PHASE_ORDER):
        next_phase_name = PHASE_ORDER[current_idx + 1]
        next_phase = get_phase(trip_id, next_phase_name, db)
        next_phase.status = PhaseStatus.pending

    db.flush()
    return phase
