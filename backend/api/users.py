from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from api.auth import get_current_user

router = APIRouter()

@router.get("/search")
def search_users(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search all registered users by name or email (authenticated callers only)."""
    results = (
        db.query(User)
        .filter(
            (User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%")),
            User.id != user.id,
        )
        .limit(8)
        .all()
    )
    return [{"id": u.id, "email": u.email, "name": u.name} for u in results]
