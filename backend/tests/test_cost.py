import pytest
from unittest.mock import patch
from models.round import TripRound, CourseNomination, RoundTier
from models.lodging import LodgingOption, LodgingType
from models.trip import Trip, TripMember
from services.cost import compute_cost_estimate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_trip_to_planning(client, token):
    """Create a trip, lock availability + destination → status == planning."""
    r = client.post("/trips", json={"name": "Cost Test Trip"},
                    headers={"Authorization": f"Bearer {token}"})
    trip = r.json()

    client.post(f"/trips/{trip['id']}/phases/availability/lock",
        json={"trip_start": "2026-10-01", "trip_end": "2026-10-05"},
        headers={"Authorization": f"Bearer {token}"})

    with patch("api.destinations.generate_destinations", return_value=[
        {
            "name": "Scottsdale, AZ",
            "region": "Arizona, US",
            "why_it_fits": "Great golf",
            "top_courses": [{"name": "TPC Scottsdale", "rating": 71.9, "slope": 128,
                             "est_green_fee": 250, "rating_source": "Golf Digest"}],
            "est_cost_per_person_rounds": 750,
            "booking_warning": "Book early",
        }
    ] * 3):
        client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mixed", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {token}"})

    client.post(f"/trips/{trip['id']}/destinations/lock",
        json={"destination_index": 0},
        headers={"Authorization": f"Bearer {token}"})

    return trip


# ---------------------------------------------------------------------------
# Test 1: rounds only, no lodging
# ---------------------------------------------------------------------------

def test_cost_estimate_rounds_only_before_lodging(auth_client, db):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)
    trip_id = trip["id"]

    # Insert 2 rounds with 2 nominations each
    round1 = TripRound(trip_id=trip_id, round_number=1, tier=RoundTier.midrange)
    round2 = TripRound(trip_id=trip_id, round_number=2, tier=RoundTier.premium)
    db.add_all([round1, round2])
    db.flush()

    # Round 1 nominations: total fees 120 and 220
    nom1a = CourseNomination(round_id=round1.id, trip_id=trip_id,
                             course_data={"name": "Course A", "green_fee": 100, "cart_fee": 20})
    nom1b = CourseNomination(round_id=round1.id, trip_id=trip_id,
                             course_data={"name": "Course B", "green_fee": 200, "cart_fee": 20})
    # Round 2 nominations: total fees 150 and 300
    nom2a = CourseNomination(round_id=round2.id, trip_id=trip_id,
                             course_data={"name": "Course C", "green_fee": 150, "cart_fee": 0})
    nom2b = CourseNomination(round_id=round2.id, trip_id=trip_id,
                             course_data={"name": "Course D", "green_fee": 300})
    db.add_all([nom1a, nom1b, nom2a, nom2b])
    db.commit()

    result = compute_cost_estimate(trip_id, db)

    # rounds_low = min(120, 220) + min(150, 300) = 120 + 150 = 270
    # rounds_high = max(120, 220) + max(150, 300) = 220 + 300 = 520
    assert result["total_low"] > 0
    assert result["total_high"] > 0
    assert result["total_low"] < result["total_high"]
    assert result["lodging_per_person_low"] == 0.0
    assert result["lodging_per_person_high"] == 0.0
    assert result["is_estimate"] is True
    assert result["round_count"] == 2
    assert result["rounds_estimate_low"] == pytest.approx(270.0)
    assert result["rounds_estimate_high"] == pytest.approx(520.0)


# ---------------------------------------------------------------------------
# Test 2: locked lodging tightens the estimate
# ---------------------------------------------------------------------------

def test_cost_estimate_tightens_after_lodging_locked(auth_client, db):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)
    trip_id = trip["id"]

    # Insert 1 round, unlocked, with 2 nominations
    rnd = TripRound(trip_id=trip_id, round_number=1, tier=RoundTier.midrange)
    db.add(rnd)
    db.flush()

    nom_a = CourseNomination(round_id=rnd.id, trip_id=trip_id,
                             course_data={"name": "Cheap Course", "green_fee": 80})
    nom_b = CourseNomination(round_id=rnd.id, trip_id=trip_id,
                             course_data={"name": "Pricey Course", "green_fee": 160})
    db.add_all([nom_a, nom_b])

    # Insert a lodging option and lock it on the trip
    opt = LodgingOption(
        trip_id=trip_id,
        lodging_type=LodgingType.rental,
        option_data={"name": "Grand House", "price_per_night": 400},
        source="manual",
    )
    db.add(opt)
    db.flush()

    # Lock the lodging option on the trip row
    trip_row = db.query(Trip).filter(Trip.id == trip_id).first()
    trip_row.locked_lodging_option_id = opt.id
    db.commit()

    result = compute_cost_estimate(trip_id, db)

    # Trip: 2026-10-01 → 2026-10-05 = 4 nights
    # group_size = 1 (only the organizer, joined)
    # lodging_per_person = 400 * 4 / 1 = 1600 (locked → low == high)
    assert result["lodging_per_person_low"] > 0.0
    assert result["lodging_per_person_low"] == pytest.approx(result["lodging_per_person_high"])
    assert result["nights"] == 4

    # Round is still unlocked → is_estimate True
    assert result["is_estimate"] is True

    # Low < high because round is unlocked and nominations differ
    assert result["total_low"] < result["total_high"]
    assert result["round_count"] == 1
