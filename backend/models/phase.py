import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from database import Base

class PhaseStatus(str, enum.Enum):
    pending = "pending"
    open = "open"
    locked = "locked"

class PhaseName(str, enum.Enum):
    availability = "availability"
    destination = "destination"
    planning = "planning"
    locked_in = "locked_in"

class TripPhase(Base):
    __tablename__ = "trip_phases"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    phase = Column(Enum(PhaseName), nullable=False)
    status = Column(Enum(PhaseStatus), nullable=False, default=PhaseStatus.pending)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    locked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
