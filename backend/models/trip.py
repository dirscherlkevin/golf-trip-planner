import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Date, Boolean, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class TripStatus(str, enum.Enum):
    planning = "planning"
    finalized = "finalized"

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    organizer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(TripStatus), default=TripStatus.planning, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    trip_start = Column(Date, nullable=True)
    trip_end = Column(Date, nullable=True)
    planned_rounds = Column(Integer, nullable=True)
    locked_lodging_option_id = Column(Integer, ForeignKey("lodging_options.id", use_alter=True, name="fk_trips_locked_lodging_option"), nullable=True)
    public_courses_only = Column(Boolean, nullable=False, default=True, server_default='true')
    lodging_booked = Column(Boolean, nullable=False, default=False, server_default='false')
    lodging_confirmation = Column(String, nullable=True)

    members = relationship("TripMember", back_populates="trip", cascade="all, delete-orphan")

class TripMember(Base):
    __tablename__ = "trip_members"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null until invite accepted
    invite_token = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    invite_email = Column(String, nullable=True)
    joined = Column(String, nullable=False, default="pending")  # pending | joined
    joined_at = Column(DateTime(timezone=True), nullable=True)
    handicap = Column(Float, nullable=True)
    last_nudged_at = Column(DateTime(timezone=True), nullable=True)

    trip = relationship("Trip", back_populates="members")
