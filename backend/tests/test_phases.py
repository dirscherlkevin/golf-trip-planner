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


def test_lock_trip_finalizes_trip():
    """POST /trips/{id}/lock finalizes the trip and enqueues trip_summary emails.

    This test uses the HTTP layer end-to-end via TestClient with the conftest
    test database (test_engine / TestingSessionLocal).
    """
    from fastapi.testclient import TestClient
    from main import app
    from database import get_db, Base
    from models.email_queue import EmailQueue
    from models.trip import Trip, TripStatus
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    import os
    from dotenv import load_dotenv
    load_dotenv()

    TEST_DB = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5433/golf_trip_planner_test",
    )
    engine = create_engine(TEST_DB)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            # 1. Register organizer
            r = client.post("/auth/register", json={
                "email": "locktrip@test.com",
                "name": "LockOrg",
                "password": "testpass123",
            })
            assert r.status_code == 200, r.text
            token = r.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # 2. Create a trip
            r = client.post("/trips/", json={"name": "Finalize Me"}, headers=headers)
            assert r.status_code == 200, r.text
            trip_id = r.json()["id"]

            # 3. Lock all phases up to locked_in via HTTP
            r = client.post(
                f"/trips/{trip_id}/phases/availability/lock",
                json={"trip_start": "2026-08-01", "trip_end": "2026-08-05"},
                headers=headers,
            )
            assert r.status_code == 200, r.text

            r = client.post(
                f"/trips/{trip_id}/phases/destination/lock",
                json={},
                headers=headers,
            )
            assert r.status_code == 200, r.text

            r = client.post(
                f"/trips/{trip_id}/phases/planning/lock",
                json={},
                headers=headers,
            )
            assert r.status_code == 200, r.text

            # locked_in phase is now open — call /lock
            r = client.post(f"/trips/{trip_id}/lock", headers=headers)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["status"] == "finalized"
            assert data["trip_id"] == trip_id

        # Verify in DB
        check_session = Session()
        try:
            trip = check_session.query(Trip).filter(Trip.id == trip_id).first()
            assert trip.status == TripStatus.finalized

            email_rows = check_session.query(EmailQueue).filter(
                EmailQueue.trip_id == trip_id,
                EmailQueue.template == "trip_summary",
            ).all()
            assert len(email_rows) >= 1
        finally:
            check_session.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
