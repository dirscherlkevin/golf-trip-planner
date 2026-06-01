from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import get_db
from models.user import User
from models.trip import TripMember
from api.auth import get_current_user

router = APIRouter()

@router.get("/search")
def search_users(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search users who share at least one trip with the caller."""
    caller_trip_ids = (
        db.query(TripMember.trip_id)
        .filter(TripMember.user_id == user.id, TripMember.joined == "joined")
        .subquery()
    )
    shared_user_ids = (
        db.query(TripMember.user_id)
        .filter(
            TripMember.trip_id.in_(select(caller_trip_ids)),
            TripMember.user_id != user.id,
            TripMember.joined == "joined",
        )
        .distinct()
        .subquery()
    )
    results = (
        db.query(User)
        .filter(
            (User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%")),
            User.id.in_(select(shared_user_ids)),
        )
        .limit(8)
        .all()
    )
    return [{"id": u.id, "email": u.email, "name": u.name} for u in results]
