import pytest
from models.trip import Trip, TripMember, TripStatus
from models.user import User
from models.destination import DestinationSuggestion
from models.round import TripRound, CourseNomination
from models.lodging import LodgingOption


def _create_user(db, email="organizer@test.com", name="Organizer", password="hashed"):
    user = User(email=email, name=name, hashed_password=password)
    db.add(user)
    db.flush()
    return user


def _create_trip(db, user, name="Test Golf Trip", status=TripStatus.planning):
    trip = Trip(name=name, organizer_id=user.id, status=status)
    db.add(trip)
    db.flush()
    member = TripMember(trip_id=trip.id, user_id=user.id, joined="joined")
    db.add(member)
    db.flush()
    return trip


def test_share_returns_404_when_not_finalized(client, db):
    """GET /share/{id} returns 404 when trip status is not finalized."""
    user = _create_user(db)
    trip = _create_trip(db, user, status=TripStatus.planning)
    db.commit()

    r = client.get(f"/share/{trip.id}")
    assert r.status_code == 404
    assert "finalized" in r.json()["detail"].lower()


def test_share_returns_summary_when_finalized(client, db):
    """GET /share/{id} returns 200 with correct summary for a finalized trip."""
    user = _create_user(db)
    trip = _create_trip(db, user, name="Masters Trip 2026", status=TripStatus.finalized)

    # Set dates
    from datetime import date
    trip.trip_start = date(2026, 10, 1)
    trip.trip_end = date(2026, 10, 5)

    # Add destination
    dest = DestinationSuggestion(
        trip_id=trip.id,
        locked_destination={"name": "Scottsdale, AZ", "region": "Arizona, US"},
    )
    db.add(dest)

    # Add a round with a locked course
    round1 = TripRound(trip_id=trip.id, round_number=1, tier="premium")
    db.add(round1)
    db.flush()

    nomination = CourseNomination(
        round_id=round1.id,
        trip_id=trip.id,
        course_data={
            "name": "TPC Scottsdale",
            "location": "Scottsdale, AZ",
            "green_fee": 250,
            "website": "https://tpc.com/scottsdale",
        },
    )
    db.add(nomination)
    db.flush()

    round1.locked_course_id = nomination.id

    # Add lodging
    lodging_opt = LodgingOption(
        trip_id=trip.id,
        lodging_type="rental",
        option_data={
            "name": "Desert Retreat House",
            "type": "rental_house",
            "price_per_night": 450,
            "booking_link": "https://vrbo.com/12345",
        },
    )
    db.add(lodging_opt)
    db.flush()

    trip.locked_lodging_option_id = lodging_opt.id

    db.commit()

    r = client.get(f"/share/{trip.id}")
    assert r.status_code == 200

    data = r.json()
    assert data["trip_id"] == trip.id
    assert data["trip_name"] == "Masters Trip 2026"
    assert data["dates"] == "2026-10-01 – 2026-10-05"
    assert data["destination"] == "Scottsdale, AZ"
    assert data["destination_region"] == "Arizona, US"
    assert "organizer@test.com" in data["members"]

    assert len(data["rounds"]) == 1
    r0 = data["rounds"][0]
    assert r0["round_number"] == 1
    assert r0["tier"] == "premium"
    assert r0["course_name"] == "TPC Scottsdale"
    assert r0["course_location"] == "Scottsdale, AZ"
    assert r0["green_fee"] == 250.0
    assert r0["website"] == "https://tpc.com/scottsdale"

    assert data["lodging"] is not None
    assert data["lodging"]["name"] == "Desert Retreat House"
    assert data["lodging"]["type"] == "rental_house"
    assert data["lodging"]["price_per_night"] == 450.0
    assert data["lodging"]["booking_link"] == "https://vrbo.com/12345"


def test_share_requires_no_auth(client, db):
    """GET /share/{id} returns 200 without any Authorization header."""
    user = _create_user(db, email="noauth@test.com")
    trip = _create_trip(db, user, status=TripStatus.finalized)
    db.commit()

    # Explicitly call WITHOUT any Authorization header
    r = client.get(f"/share/{trip.id}")
    assert r.status_code == 200
    assert r.json()["trip_id"] == trip.id
