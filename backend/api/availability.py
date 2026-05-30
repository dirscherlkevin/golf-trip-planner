from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from api.auth import get_current_user
from models.user import User
from models.trip import Trip, TripMember
from models.availability import AvailabilityResponse
from models.email_queue import EmailQueue, EmailStatus
from models.phase import PhaseName, PhaseStatus
from schemas.availability import AvailabilityIn, AvailabilityOut, MemberAvailabilityOut, OverlapOut, OverlapDay, BudgetAggregate
from services.phases import get_phase
from datetime import datetime, timezone, timedelta
from typing import Optional
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

@router.post("/{trip_id}/availability", status_code=204)
def submit_availability(
    trip_id: int,
    data: AvailabilityIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    phase = get_phase(trip_id, PhaseName.availability, db)
    if phase.status == PhaseStatus.locked:
        raise HTTPException(status_code=409, detail="Availability phase is locked")
    existing = db.query(AvailabilityResponse).filter(
        AvailabilityResponse.trip_id == trip_id,
        AvailabilityResponse.user_id == user.id
    ).first()
    date_ranges_json = [{"start": r.start, "end": r.end, "type": r.type or "available"} for r in data.date_ranges]
    if existing:
        existing.date_ranges = date_ranges_json
        existing.happy_spend = data.happy_spend
        existing.hard_limit = data.hard_limit
        existing.submitted_at = datetime.now(timezone.utc)
    else:
        db.add(AvailabilityResponse(
            trip_id=trip_id,
            user_id=user.id,
            date_ranges=date_ranges_json,
            happy_spend=data.happy_spend,
            hard_limit=data.hard_limit,
        ))
    db.commit()

@router.get("/{trip_id}/availability", response_model=AvailabilityOut)
def get_availability(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    responses = db.query(AvailabilityResponse).filter(AvailabilityResponse.trip_id == trip_id).all()

    is_organizer = trip.organizer_id == user.id

    member_outs = [
        MemberAvailabilityOut(
            user_id=r.user_id,
            date_ranges=[{"start": d["start"], "end": d["end"], "type": d.get("type", "available")} for d in r.date_ranges],
            submitted_at=r.submitted_at.isoformat() if r.submitted_at else None,
        )
        for r in responses
    ]

    own = next((m for m in member_outs if m.user_id == user.id), None)

    budget = None
    if is_organizer and responses:
        happy_vals = [float(r.happy_spend) for r in responses if r.happy_spend is not None]
        hard_vals = [float(r.hard_limit) for r in responses if r.hard_limit is not None]
        budget = BudgetAggregate(
            median_happy=statistics.median(happy_vals) if happy_vals else None,
            median_hard=statistics.median(hard_vals) if hard_vals else None,
            min_hard=min(hard_vals) if hard_vals else None,
            max_hard=max(hard_vals) if hard_vals else None,
            responded_count=len(responses),
        )

    responded_user_ids = [r.user_id for r in responses]

    return AvailabilityOut(
        responses=member_outs if is_organizer else [],
        budget=budget,
        own_response=own,
        responded_user_ids=responded_user_ids,
    )

@router.get("/{trip_id}/availability/overlap", response_model=OverlapOut)
def get_overlap(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_member(trip_id, user.id, db)
    responses = db.query(AvailabilityResponse).filter(AvailabilityResponse.trip_id == trip_id).all()
    total_members = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.joined == "joined"
    ).count()

    from datetime import date
    from collections import defaultdict
    counts: dict = defaultdict(int)
    pref_counts: dict = defaultdict(int)
    for r in responses:
        for dr in r.date_ranges:
            dr_type = dr.get("type", "available")
            start = date.fromisoformat(dr["start"])
            end = date.fromisoformat(dr["end"])
            current = start
            while current <= end:
                counts[current] += 1
                if dr_type == "available":
                    pref_counts[current] += 1
                current += timedelta(days=1)

    days = [OverlapDay(date=str(d), count=c, pref_count=pref_counts[d]) for d, c in sorted(counts.items())]
    return OverlapOut(days=days, total_members=total_members)

@router.post("/{trip_id}/nudge", status_code=204)
def nudge_non_responders(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_trip_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can nudge members")

    responded_user_ids = {
        r.user_id for r in db.query(AvailabilityResponse).filter(
            AvailabilityResponse.trip_id == trip_id
        ).all()
    }
    members = db.query(TripMember).filter(
        TripMember.trip_id == trip_id,
        TripMember.joined == "joined",
    ).all()
    non_responders = [m for m in members if m.user_id not in responded_user_ids]

    for m in non_responders:
        if m.user_id:
            db.add(EmailQueue(
                trip_id=trip_id,
                recipient_user_id=m.user_id,
                template="availability_reminder",
                payload={"trip_name": trip.name},
                status=EmailStatus.pending,
            ))
    db.commit()
