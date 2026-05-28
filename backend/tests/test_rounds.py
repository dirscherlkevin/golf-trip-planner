import pytest
from unittest.mock import patch

MOCK_COURSES = [
    {
        "name": "TPC Scottsdale",
        "location": "Scottsdale, AZ",
        "rating": 71.9,
        "slope": 128,
        "par": 72,
        "yardage_options": {"championship": 7216, "member": 6600, "forward": 6000},
        "green_fee": 250,
        "cart_fee": 25,
        "walking_policy": "Cart required",
        "architect": "Tom Weiskopf",
        "pace_of_play": "4:30 average",
        "tee_time_window": "Opens 90 days out",
        "rating_source": "Golf Digest",
    },
    {
        "name": "Troon North (Monument)",
        "location": "Scottsdale, AZ",
        "rating": 73.8,
        "slope": 143,
        "par": 72,
        "yardage_options": {"championship": 7028, "member": 6500},
        "green_fee": 295,
        "cart_fee": 30,
        "walking_policy": "Walking allowed",
        "architect": "Tom Weiskopf",
        "pace_of_play": "4:15 average",
        "tee_time_window": "Opens 60 days out",
        "rating_source": "Golf Digest",
    },
]

def _setup_trip_to_planning(client, token):
    """Create a trip, lock availability with dates, lock a destination → planning opens."""
    r = client.post("/trips", json={"name": "Rounds Test Trip"},
                    headers={"Authorization": f"Bearer {token}"})
    trip = r.json()

    # Lock availability
    client.post(f"/trips/{trip['id']}/phases/availability/lock",
        json={"trip_start": "2026-10-01", "trip_end": "2026-10-05"},
        headers={"Authorization": f"Bearer {token}"})

    # Generate + lock destination (mocked)
    with patch("api.destinations.generate_destinations", return_value=[
        {
            "name": "Scottsdale, AZ",
            "region": "Arizona, US",
            "why_it_fits": "Great golf",
            "top_courses": [{"name": "TPC Scottsdale", "rating": 71.9, "slope": 128, "est_green_fee": 250, "rating_source": "Golf Digest"}],
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

def test_setup_rounds_creates_correct_rows(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.rounds._generate_courses_for_round_bg"):
        r = client.post(f"/trips/{trip['id']}/rounds/setup",
            json={"rounds": [
                {"round_number": 1, "tier": "premium"},
                {"round_number": 2, "tier": "value"},
            ]},
            headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["round_number"] == 1
    assert data[0]["tier"] == "premium"
    assert data[1]["tier"] == "value"

def test_nominate_course_enters_vote_pool(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.rounds._generate_courses_for_round_bg"):
        setup_r = client.post(f"/trips/{trip['id']}/rounds/setup",
            json={"rounds": [{"round_number": 1, "tier": "midrange"}]},
            headers={"Authorization": f"Bearer {token}"})

    round_id = setup_r.json()[0]["id"]
    r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominate",
        json={"course_data": {"name": "My Course", "location": "Phoenix, AZ", "rating": 70.0, "slope": 120, "green_fee": 150}},
        headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    assert r.json()["source"] == "manual"
    assert r.json()["course_data"]["name"] == "My Course"

def test_vote_upserts(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.rounds._generate_courses_for_round_bg"):
        setup_r = client.post(f"/trips/{trip['id']}/rounds/setup",
            json={"rounds": [{"round_number": 1, "tier": "premium"}]},
            headers={"Authorization": f"Bearer {token}"})

    round_id = setup_r.json()[0]["id"]
    nom_r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominate",
        json={"course_data": {"name": "TPC", "location": "AZ", "rating": 72.0, "slope": 130, "green_fee": 200}},
        headers={"Authorization": f"Bearer {token}"})
    nom_id = nom_r.json()["id"]

    r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominations/{nom_id}/vote",
        json={"vote": "up"},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    # Upsert — change to down
    r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominations/{nom_id}/vote",
        json={"vote": "down"},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

def test_organizer_can_lock_round(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.rounds._generate_courses_for_round_bg"):
        setup_r = client.post(f"/trips/{trip['id']}/rounds/setup",
            json={"rounds": [{"round_number": 1, "tier": "premium"}]},
            headers={"Authorization": f"Bearer {token}"})

    round_id = setup_r.json()[0]["id"]
    nom_r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominate",
        json={"course_data": {"name": "TPC", "location": "AZ", "rating": 72.0, "slope": 130, "green_fee": 200}},
        headers={"Authorization": f"Bearer {token}"})
    nom_id = nom_r.json()["id"]

    r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/lock",
        json={"nomination_id": nom_id},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["locked_course_id"] == nom_id

def test_all_rounds_locked_check(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.rounds._generate_courses_for_round_bg"):
        setup_r = client.post(f"/trips/{trip['id']}/rounds/setup",
            json={"rounds": [{"round_number": 1, "tier": "value"}]},
            headers={"Authorization": f"Bearer {token}"})

    round_id = setup_r.json()[0]["id"]
    nom_r = client.post(f"/trips/{trip['id']}/rounds/{round_id}/nominate",
        json={"course_data": {"name": "Budget Course", "location": "AZ", "rating": 68.0, "slope": 115, "green_fee": 50}},
        headers={"Authorization": f"Bearer {token}"})
    nom_id = nom_r.json()["id"]

    client.post(f"/trips/{trip['id']}/rounds/{round_id}/lock",
        json={"nomination_id": nom_id},
        headers={"Authorization": f"Bearer {token}"})

    # Verify round is locked
    rounds_r = client.get(f"/trips/{trip['id']}/rounds", headers={"Authorization": f"Bearer {token}"})
    assert rounds_r.json()[0]["locked_course_id"] == nom_id
