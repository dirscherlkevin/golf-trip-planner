from pydantic import BaseModel
from typing import Any, Optional


class LodgingSetupIn(BaseModel):
    lodging_type: str  # "rental", "hotel", "both"


class LodgingNominateIn(BaseModel):
    option_data: dict


class VoteIn(BaseModel):
    vote: str  # "up" or "down"


class LodgingVoteTally(BaseModel):
    option_id: int
    up_votes: int
    down_votes: int
    my_vote: Optional[str] = None


class LodgingOptionOut(BaseModel):
    id: int
    trip_id: int
    lodging_type: str
    option_data: Any
    added_by: Optional[int] = None
    source: str
    vote_tally: Optional[LodgingVoteTally] = None
    model_config = {"from_attributes": True}


class LodgingSetupOut(BaseModel):
    lodging_type: str
    generation_status: str
    options: list[LodgingOptionOut] = []
    locked_option_id: Optional[int] = None
