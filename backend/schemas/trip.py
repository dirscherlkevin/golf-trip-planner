from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date

class TripCreate(BaseModel):
    name: str

class TripMemberOut(BaseModel):
    id: int
    invite_email: Optional[str]
    joined: str
    user_id: Optional[int]
    handicap: Optional[float] = None
    last_nudged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class TripOut(BaseModel):
    id: int
    name: str
    organizer_id: int
    status: str
    created_at: datetime
    trip_start: Optional[date] = None
    trip_end: Optional[date] = None
    planned_rounds: Optional[int] = None
    members: list[TripMemberOut]

    model_config = {"from_attributes": True}

class InviteCreate(BaseModel):
    email: EmailStr

class InviteOut(BaseModel):
    invite_token: str
    invite_url: str
