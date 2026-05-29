from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from models.destination import GenerationStatus

class GenerateDestinationsIn(BaseModel):
    skill_mix: str
    tier_filter: str = "show_all"  # "show_all", "budget", "midrange", "luxury"
    country: str = "United States"
    region: str = ""
    planned_rounds: int = 3

class NominateDestinationIn(BaseModel):
    name: str
    region: str = ""
    why_it_fits: str = ""

class VoteIn(BaseModel):
    destination_index: int
    vote: str  # "up" or "down"

class LockDestinationIn(BaseModel):
    destination_index: int
    override: bool = False

class DestinationSuggestionOut(BaseModel):
    id: int
    trip_id: int
    generation_status: GenerationStatus
    suggestions: Optional[list[Any]] = None
    locked_destination: Optional[Any] = None
    generated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class DestinationVoteTally(BaseModel):
    destination_index: int
    up_votes: int
    down_votes: int
    my_vote: Optional[str] = None  # "up", "down", or None

class DestinationSuggestionWithVotesOut(BaseModel):
    suggestion: DestinationSuggestionOut
    vote_tallies: list[DestinationVoteTally]
