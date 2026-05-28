from pydantic import BaseModel
from typing import Optional, Any
from models.round import RoundTier, RoundGenerationStatus

class RoundSetupItem(BaseModel):
    round_number: int
    tier: RoundTier

class RoundSetupIn(BaseModel):
    rounds: list[RoundSetupItem]

class CourseNominateIn(BaseModel):
    course_data: dict  # free-form course info for manual nominations

class VoteIn(BaseModel):
    vote: str  # "up" or "down"

class LockCourseIn(BaseModel):
    nomination_id: int
    override: bool = False

class CourseVoteTally(BaseModel):
    nomination_id: int
    up_votes: int
    down_votes: int
    my_vote: Optional[str] = None

class CourseNominationOut(BaseModel):
    id: int
    round_id: int
    course_data: Any
    nominated_by: Optional[int] = None
    source: str
    vote_tally: Optional[CourseVoteTally] = None

    model_config = {"from_attributes": True}

class TripRoundOut(BaseModel):
    id: int
    trip_id: int
    round_number: int
    tier: RoundTier
    generation_status: RoundGenerationStatus
    locked_course_id: Optional[int] = None
    nominations: list[CourseNominationOut] = []

    model_config = {"from_attributes": True}
