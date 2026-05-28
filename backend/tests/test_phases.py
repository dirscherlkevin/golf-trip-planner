import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

from database import Base
from models.user import User
from models.trip import Trip, TripMember
from models.phase import TripPhase, PhaseStatus, PhaseName
from services.phases import initialize_phases, get_phases, lock_phase, reopen_phase, get_phase

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/golf_trip_planner_test"
)


@pytest.fixture
def db():
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def trip_with_organizer(db):
    """Creates a user and trip in the test DB, returns (trip, user)."""
    user = User(email="org@test.com", name="Organizer", hashed_password="x")
    db.add(user)
    db.flush()
    trip = Trip(name="Test Trip", organizer_id=user.id)
    db.add(trip)
    db.flush()
    member = TripMember(trip_id=trip.id, user_id=user.id, joined="joined")
    db.add(member)
    db.flush()
    return trip, user


def test_initialize_phases_creates_four_rows(db, trip_with_organizer):
    trip, user = trip_with_organizer
    initialize_phases(trip.id, db)
    db.commit()
    phases = get_phases(trip.id, db)
    assert len(phases) == 4
    assert phases[0].phase == PhaseName.availability
    assert phases[0].status == PhaseStatus.open
    assert all(p.status == PhaseStatus.pending for p in phases[1:])


def test_lock_availability_opens_destination(db, trip_with_organizer):
    trip, user = trip_with_organizer
    initialize_phases(trip.id, db)
    db.commit()
    lock_phase(trip.id, PhaseName.availability, user.id, db)
    db.commit()
    avail = get_phase(trip.id, PhaseName.availability, db)
    dest = get_phase(trip.id, PhaseName.destination, db)
    assert avail.status == PhaseStatus.locked
    assert dest.status == PhaseStatus.open


def test_non_organizer_cannot_lock_phase(db, trip_with_organizer):
    from fastapi import HTTPException
    trip, user = trip_with_organizer
    other = User(email="other@test.com", name="Other", hashed_password="x")
    db.add(other)
    db.flush()
    initialize_phases(trip.id, db)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        lock_phase(trip.id, PhaseName.availability, other.id, db)
    assert exc.value.status_code == 403


def test_cannot_lock_already_locked_phase(db, trip_with_organizer):
    from fastapi import HTTPException
    trip, user = trip_with_organizer
    initialize_phases(trip.id, db)
    lock_phase(trip.id, PhaseName.availability, user.id, db)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        lock_phase(trip.id, PhaseName.availability, user.id, db)
    assert exc.value.status_code == 400


def test_reopen_availability_when_destination_not_locked(db, trip_with_organizer):
    trip, user = trip_with_organizer
    initialize_phases(trip.id, db)
    lock_phase(trip.id, PhaseName.availability, user.id, db)
    db.commit()
    # destination is now open but not locked — reopen should succeed
    reopen_phase(trip.id, PhaseName.availability, user.id, db)
    db.commit()
    avail = get_phase(trip.id, PhaseName.availability, db)
    dest = get_phase(trip.id, PhaseName.destination, db)
    assert avail.status == PhaseStatus.open
    assert dest.status == PhaseStatus.pending
