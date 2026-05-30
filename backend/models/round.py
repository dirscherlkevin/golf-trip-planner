import enum
from sqlalchemy import Column, Integer, String, DateTime, Date, Boolean, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base

class RoundTier(str, enum.Enum):
    premium = "premium"
    midrange = "midrange"
    value = "value"

class RoundGenerationStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"

class NominationSource(str, enum.Enum):
    ai = "ai"
    manual = "manual"

class TripRound(Base):
    __tablename__ = "trip_rounds"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    round_number = Column(Integer, nullable=False)   # 1, 2, 3, ...
    tier = Column(Enum(RoundTier), nullable=False)
    locked_course_id = Column(Integer, ForeignKey("course_nominations.id", use_alter=True, name="fk_trip_rounds_locked_course"), nullable=True)
    generation_status = Column(Enum(RoundGenerationStatus), nullable=False, default=RoundGenerationStatus.pending)
    tee_time = Column(String, nullable=True)
    round_date = Column(Date, nullable=True)
    booked = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CourseNomination(Base):
    __tablename__ = "course_nominations"

    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("trip_rounds.id", ondelete="CASCADE"), nullable=False)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    course_data = Column(JSONB, nullable=False)       # course info dict from Claude or manual
    nominated_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = AI
    source = Column(Enum(NominationSource), nullable=False, default=NominationSource.ai)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CourseVote(Base):
    __tablename__ = "course_votes"

    id = Column(Integer, primary_key=True, index=True)
    nomination_id = Column(Integer, ForeignKey("course_nominations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vote = Column(String, nullable=False)             # "up" or "down"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("nomination_id", "user_id", name="uq_course_vote_nom_user"),)


class DestinationCourseCache(Base):
    """Caches AI-generated courses per destination so Phase 3 doesn't re-generate."""
    __tablename__ = "destination_course_cache"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    destination_name = Column(String, nullable=False)
    courses = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
