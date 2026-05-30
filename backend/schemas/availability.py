from pydantic import BaseModel, model_validator
from datetime import date
from typing import Optional

class DateRange(BaseModel):
    start: str  # ISO date string "YYYY-MM-DD"
    end: str    # ISO date string "YYYY-MM-DD"
    type: Optional[str] = "available"  # "available" or "if_needed"

    @model_validator(mode="after")
    def validate_range(self):
        if self.end < self.start:
            raise ValueError("end must be on or after start")
        return self

class AvailabilityIn(BaseModel):
    date_ranges: list[DateRange]
    happy_spend: Optional[float] = None
    hard_limit: Optional[float] = None

class BudgetAggregate(BaseModel):
    median_happy: Optional[float] = None
    median_hard: Optional[float] = None
    min_hard: Optional[float] = None
    max_hard: Optional[float] = None
    responded_count: int

class MemberAvailabilityOut(BaseModel):
    user_id: int
    date_ranges: list[DateRange]
    submitted_at: Optional[str] = None

    model_config = {"from_attributes": True}

class AvailabilityOut(BaseModel):
    responses: list[MemberAvailabilityOut]
    budget: Optional[BudgetAggregate] = None  # only returned for organizer
    own_response: Optional[MemberAvailabilityOut] = None
    responded_user_ids: list[int] = []  # always returned; all members can see who has responded (not what)

class OverlapDay(BaseModel):
    date: str  # ISO date string
    count: int        # available + if_needed
    pref_count: int = 0  # available only

class OverlapOut(BaseModel):
    days: list[OverlapDay]
    total_members: int
