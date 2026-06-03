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
    flights: Optional[dict] = None
    name: Optional[str] = None
    invite_token: Optional[str] = None

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
    lodging_skipped: bool = False
    budget_happy_spend: Optional[float] = None
    budget_hard_limit: Optional[float] = None
    members: list[TripMemberOut]
    current_phase: Optional[str] = None
    user_action_pending: bool = False
    share_token: Optional[str] = None

    model_config = {"from_attributes": True}

class InviteCreate(BaseModel):
    email: EmailStr

class InviteOut(BaseModel):
    invite_token: str
    invite_url: str
