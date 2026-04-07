from datetime import date, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session
from models.availability import Availability
from models.trip import TripMember

def compute_overlap(trip_id: int, db: Session) -> dict:
    """Returns {date: member_count} for all dates covered by any member's availability."""
    ranges = db.query(Availability).filter(Availability.trip_id == trip_id).all()
    total_members = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.joined == "joined"
    ).count()

    counts: dict[date, int] = defaultdict(int)
    for avail in ranges:
        current = avail.start_date
        while current <= avail.end_date:
            counts[current] += 1
            current += timedelta(days=1)

    days = [{"date": d, "count": c} for d, c in sorted(counts.items())]
    return {"days": days, "total_members": total_members}
