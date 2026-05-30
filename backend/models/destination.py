import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base

class GenerationStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"

class DestinationSuggestion(Base):
    __tablename__ = "destination_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, unique=True)
    generation_status = Column(Enum(GenerationStatus), nullable=False, default=GenerationStatus.pending)
    suggestions = Column(JSONB, nullable=True)             # list of destination dicts from Claude
    locked_destination = Column(JSONB, nullable=True)      # the winning destination dict
    generated_at = Column(DateTime(timezone=True), nullable=True)
    prompt_inputs = Column(JSONB, nullable=True)           # what was sent to Claude

class DestinationVote(Base):
    __tablename__ = "destination_votes"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    destination_index = Column(Integer, nullable=False)    # 0, 1, or 2
    vote = Column(String, nullable=False)                   # "up" or "down"

    __table_args__ = (UniqueConstraint("trip_id", "user_id", "destination_index", name="uq_dest_vote_trip_user_dest"),)
