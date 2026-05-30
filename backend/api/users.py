from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from api.auth import get_current_user

router = APIRouter()

def _email_to_name(email: str) -> str:
    local = email.split('@')[0]
    return local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()

@router.get("/search")
def search_users(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search registered users by email prefix. Excludes the caller."""
    results = (
        db.query(User)
        .filter(User.email.ilike(f"{q}%"), User.id != user.id)
        .limit(8)
        .all()
    )
    return [{"id": u.id, "email": u.email, "name": _email_to_name(u.email)} for u in results]
