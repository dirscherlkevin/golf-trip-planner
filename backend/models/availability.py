import enum
from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base

class AvailabilityResponse(Base):
    __tablename__ = "availability_responses"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date_ranges = Column(JSONB, nullable=False)  # list of {start, end} strings
    happy_spend = Column(Numeric(10, 2), nullable=True)
    hard_limit = Column(Numeric(10, 2), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("trip_id", "user_id", name="uq_avail_trip_user"),)
