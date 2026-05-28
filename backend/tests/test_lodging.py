import pytest
from unittest.mock import patch

MOCK_LODGING = [
    {
        "name": "Desert Retreat House",
        "type": "rental_house",
        "price_per_night": 450,
        "beds": 5,
        "capacity": 10,
        "distance_to_courses": "5 min to TPC Scottsdale, 15 min to Troon North",
        "booking_link": "https://vrbo.com/12345",
        "highlights": "Spacious 5-bed house with pool. Perfect for golf groups.",
    },
    {
        "name": "Westin Kierland Resort",
        "type": "hotel",
        "price_per_night": 350,
        "beds": 4,
        "capacity": 8,
        "distance_to_courses": "On-site golf, 10 min to TPC Scottsdale",
        "booking_link": "https://marriott.com/kierland",
        "highlights": "Full-service resort with on-site course. Great amenities.",
    },
]


def _setup_trip_to_planning(client, token):
    """Create a trip, lock availability with dates, lock a destination → planning opens."""
    r = client.post("/trips", json={"name": "Lodging Test Trip"},
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


def test_setup_lodging_creates_setup_row(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.lodging._generate_lodging_bg"):
        r = client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "rental"},
            headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert data["lodging_type"] == "rental"
    assert data["generation_status"] == "pending"
    assert data["options"] == []
    assert data["locked_option_id"] is None


def test_setup_lodging_requires_organizer(auth_client, client):
    _, organizer_token = auth_client
    trip = _setup_trip_to_planning(client, organizer_token)

    # Register a second user
    r2 = client.post("/auth/register", json={
        "email": "member@test.com", "name": "Member", "password": "testpass123"
    })
    member_token = r2.json()["access_token"]

    with patch("api.lodging._generate_lodging_bg"):
        r = client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "hotel"},
            headers={"Authorization": f"Bearer {member_token}"})

    # Member is not a trip member at all, so should get 403
    assert r.status_code == 403


def test_setup_lodging_idempotent_guard(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.lodging._generate_lodging_bg"):
        r1 = client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "rental"},
            headers={"Authorization": f"Bearer {token}"})
        assert r1.status_code == 200

        r2 = client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "hotel"},
            headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 409


def test_get_lodging_404_before_setup(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    r = client.get(f"/trips/{trip['id']}/lodging",
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404
    assert "not set up" in r.json()["detail"]


def test_nominate_manual_option(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.lodging._generate_lodging_bg"):
        client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "both"},
            headers={"Authorization": f"Bearer {token}"})

    r = client.post(f"/trips/{trip['id']}/lodging/nominate",
        json={"option_data": {"name": "My Rental House", "type": "rental_house", "price_per_night": 300}},
        headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "manual"
    assert data["option_data"]["name"] == "My Rental House"
    assert data["added_by"] is not None


def test_vote_upserts(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.lodging._generate_lodging_bg"):
        client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "hotel"},
            headers={"Authorization": f"Bearer {token}"})

    nom_r = client.post(f"/trips/{trip['id']}/lodging/nominate",
        json={"option_data": {"name": "Hilton", "type": "hotel", "price_per_night": 200}},
        headers={"Authorization": f"Bearer {token}"})
    opt_id = nom_r.json()["id"]

    # Vote up
    r1 = client.post(f"/trips/{trip['id']}/lodging/options/{opt_id}/vote",
        json={"vote": "up"},
        headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 204

    # Change to down (upsert)
    r2 = client.post(f"/trips/{trip['id']}/lodging/options/{opt_id}/vote",
        json={"vote": "down"},
        headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 204

    # Verify final tally: 0 up, 1 down
    get_r = client.get(f"/trips/{trip['id']}/lodging",
        headers={"Authorization": f"Bearer {token}"})
    opts = get_r.json()["options"]
    opt_out = next(o for o in opts if o["id"] == opt_id)
    assert opt_out["vote_tally"]["up_votes"] == 0
    assert opt_out["vote_tally"]["down_votes"] == 1
    assert opt_out["vote_tally"]["my_vote"] == "down"


def test_lock_lodging_sets_trip_column(auth_client):
    client, token = auth_client
    trip = _setup_trip_to_planning(client, token)

    with patch("api.lodging._generate_lodging_bg"):
        client.post(f"/trips/{trip['id']}/lodging/setup",
            json={"lodging_type": "rental"},
            headers={"Authorization": f"Bearer {token}"})

    nom_r = client.post(f"/trips/{trip['id']}/lodging/nominate",
        json={"option_data": {"name": "Grand House", "type": "rental_house", "price_per_night": 500}},
        headers={"Authorization": f"Bearer {token}"})
    opt_id = nom_r.json()["id"]

    lock_r = client.post(f"/trips/{trip['id']}/lodging/options/{opt_id}/lock",
        headers={"Authorization": f"Bearer {token}"})

    assert lock_r.status_code == 200
    data = lock_r.json()
    assert data["locked_option_id"] == opt_id
