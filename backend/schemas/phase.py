from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional
from models.phase import PhaseStatus, PhaseName

class TripPhaseOut(BaseModel):
    phase: PhaseName
    status: PhaseStatus
    locked_at: Optional[datetime] = None
    locked_by: Optional[int] = None

    model_config = {"from_attributes": True}

class LockPhaseIn(BaseModel):
    entity_id: Optional[int] = None
    entity_type: Optional[str] = None
    override: bool = False
    trip_start: Optional[date] = None  # required when locking availability phase
    trip_end: Optional[date] = None
