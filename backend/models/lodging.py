import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base


class LodgingType(str, enum.Enum):
    rental = "rental"
    hotel = "hotel"
    both = "both"


class LodgingGenerationStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"


class LodgingSetup(Base):
    __tablename__ = "lodging_setups"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, unique=True)
    lodging_type = Column(Enum(LodgingType), nullable=False)
    generation_status = Column(Enum(LodgingGenerationStatus), nullable=False, default=LodgingGenerationStatus.pending)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    prompt_inputs = Column(JSONB, nullable=True)  # includes _started_at for stuck-row detection


class LodgingOption(Base):
    __tablename__ = "lodging_options"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    lodging_type = Column(Enum(LodgingType), nullable=False)
    option_data = Column(JSONB, nullable=False)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = AI
    source = Column(String, nullable=False, default="ai")              # "ai" or "manual"
    generation_status = Column(Enum(LodgingGenerationStatus), nullable=False, default=LodgingGenerationStatus.complete)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LodgingVote(Base):
    __tablename__ = "lodging_votes"

    id = Column(Integer, primary_key=True)
    option_id = Column(Integer, ForeignKey("lodging_options.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vote = Column(String, nullable=False)  # "up" or "down"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("option_id", "user_id", name="uq_lodging_vote_opt_user"),)
