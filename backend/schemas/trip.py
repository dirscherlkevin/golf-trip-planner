from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class TripCreate(BaseModel):
    name: str

class TripMemberOut(BaseModel):
    id: int
    invite_email: Optional[str]
    joined: str
    user_id: Optional[int]

    model_config = {"from_attributes": True}

class TripOut(BaseModel):
    id: int
    name: str
    organizer_id: int
    status: str
    created_at: datetime
    members: list[TripMemberOut]

    model_config = {"from_attributes": True}

class InviteCreate(BaseModel):
    email: EmailStr

class InviteOut(BaseModel):
    invite_token: str
    invite_url: str
