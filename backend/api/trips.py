from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.trip import Trip, TripMember
from models.user import User
from schemas.trip import TripCreate, TripOut, InviteCreate, InviteOut
from api.auth import get_current_user
import uuid

router = APIRouter()

@router.post("", response_model=TripOut)
def create_trip(data: TripCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = Trip(name=data.name, organizer_id=user.id)
    db.add(trip)
    db.flush()
    # Add organizer as first member (already joined)
    member = TripMember(
        trip_id=trip.id,
        user_id=user.id,
        invite_email=user.email,
        joined="joined",
    )
    db.add(member)
    db.commit()
    db.refresh(trip)
    return trip

@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member_trip_ids = db.query(TripMember.trip_id).filter(
        TripMember.user_id == user.id, TripMember.joined == "joined"
    ).subquery()
    return db.query(Trip).filter(Trip.id.in_(member_trip_ids)).all()

@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)
    return trip

@router.post("/{trip_id}/invite", response_model=InviteOut)
def invite_member(trip_id: int, data: InviteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can invite members")
    token = str(uuid.uuid4())
    member = TripMember(trip_id=trip_id, invite_email=data.email, invite_token=token)
    db.add(member)
    db.commit()
    return InviteOut(invite_token=token, invite_url=f"http://localhost:5173/join/{token}")

@router.post("/join/{invite_token}", response_model=TripOut)
def join_trip(invite_token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(TripMember).filter(TripMember.invite_token == invite_token).first()
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found")
    if member.joined == "joined":
        raise HTTPException(status_code=400, detail="Invite already used")
    member.user_id = user.id
    member.joined = "joined"
    db.commit()
    db.refresh(member)
    return member.trip

def _get_trip_for_member(trip_id: int, user_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.user_id == user_id, TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip

