import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.sql import func
from database import Base

class DecisionType(str, enum.Enum):
    date_locked = "date_locked"
    destination_locked = "destination_locked"
    round_locked = "round_locked"
    lodging_locked = "lodging_locked"
    trip_locked = "trip_locked"

class TripDecision(Base):
    __tablename__ = "trip_decisions"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    decision_type = Column(Enum(DecisionType), nullable=False)
    entity_id = Column(Integer, nullable=True)
    entity_type = Column(String, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    decided_at = Column(DateTime(timezone=True), server_default=func.now())
    override = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
