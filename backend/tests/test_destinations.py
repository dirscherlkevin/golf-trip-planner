import pytest
from unittest.mock import patch

def _register_and_login(client, email, name):
    r = client.post("/auth/register", json={"email": email, "name": name, "password": "pass123"})
    return r.json()["access_token"]

def _create_trip_with_dates(client, token):
    r = client.post("/trips", json={"name": "Dest Test Trip"}, headers={"Authorization": f"Bearer {token}"})
    trip = r.json()
    # Lock availability with dates so destination phase opens
    client.post(f"/trips/{trip['id']}/phases/availability/lock",
        json={"trip_start": "2026-10-01", "trip_end": "2026-10-05"},
        headers={"Authorization": f"Bearer {token}"})
    return trip

MOCK_DESTINATIONS = [
    {
        "name": "Scottsdale, AZ",
        "region": "Arizona, US",
        "why_it_fits": "Great desert golf.",
        "top_courses": [{"name": "TPC Scottsdale", "rating": 71.9, "slope": 128, "est_green_fee": 250, "rating_source": "Golf Digest"}],
        "est_cost_per_person_rounds": 750,
        "booking_warning": "Book 6+ months out",
    },
    {
        "name": "Myrtle Beach, SC",
        "region": "South Carolina, US",
        "why_it_fits": "Great value golf.",
        "top_courses": [{"name": "Caledonia Golf & Fish Club", "rating": 70.8, "slope": 130, "est_green_fee": 180, "rating_source": "GolfAdvisor"}],
        "est_cost_per_person_rounds": 400,
        "booking_warning": "Book 3 months out",
    },
    {
        "name": "Bandon, OR",
        "region": "Oregon, US",
        "why_it_fits": "World class links.",
        "top_courses": [{"name": "Bandon Dunes", "rating": 73.2, "slope": 135, "est_green_fee": 325, "rating_source": "Golf Digest"}],
        "est_cost_per_person_rounds": 975,
        "booking_warning": "Book 12 months out",
    },
]

def test_generate_destinations_persists_to_db(auth_client):
    client, token = auth_client
    trip = _create_trip_with_dates(client, token)

    with patch("api.destinations.generate_destinations", return_value=MOCK_DESTINATIONS):
        r = client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mostly mid-handicap", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert data["generation_status"] == "complete"
    assert len(data["suggestions"]) == 3
    assert data["suggestions"][0]["name"] == "Scottsdale, AZ"

def test_generate_fails_gracefully_on_claude_error(auth_client):
    client, token = auth_client
    trip = _create_trip_with_dates(client, token)

    with patch("api.destinations.generate_destinations", side_effect=ValueError("Claude error")):
        r = client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mixed", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert data["generation_status"] == "failed"

def test_vote_upserts(auth_client):
    client, token = auth_client
    trip = _create_trip_with_dates(client, token)

    with patch("api.destinations.generate_destinations", return_value=MOCK_DESTINATIONS):
        client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mixed", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {token}"})

    # Vote up on destination 0
    r = client.post(f"/trips/{trip['id']}/destinations/vote",
        json={"destination_index": 0, "vote": "up"},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    # Vote again (upsert) — switch to down
    r = client.post(f"/trips/{trip['id']}/destinations/vote",
        json={"destination_index": 1, "vote": "down"},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

def test_non_organizer_cannot_lock(client, auth_client):
    org_client, org_token = auth_client
    trip = _create_trip_with_dates(org_client, org_token)

    with patch("api.destinations.generate_destinations", return_value=MOCK_DESTINATIONS):
        org_client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mixed", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {org_token}"})

    # Register and invite a second member
    member_token = _register_and_login(client, "member2@test.com", "Member2")
    invite_r = org_client.post(f"/trips/{trip['id']}/invite",
        json={"email": "member2@test.com"},
        headers={"Authorization": f"Bearer {org_token}"})
    invite_token = invite_r.json()["invite_token"]
    client.post(f"/trips/join/{invite_token}", headers={"Authorization": f"Bearer {member_token}"})

    # Member tries to lock — should fail
    r = client.post(f"/trips/{trip['id']}/destinations/lock",
        json={"destination_index": 0},
        headers={"Authorization": f"Bearer {member_token}"})
    assert r.status_code == 403

def test_lock_sets_locked_destination_and_advances_phase(auth_client):
    client, token = auth_client
    trip = _create_trip_with_dates(client, token)

    with patch("api.destinations.generate_destinations", return_value=MOCK_DESTINATIONS):
        client.post(f"/trips/{trip['id']}/destinations/generate",
            json={"skill_mix": "mixed", "tier_filter": "show_all", "country": "United States"},
            headers={"Authorization": f"Bearer {token}"})

    r = client.post(f"/trips/{trip['id']}/destinations/lock",
        json={"destination_index": 1},
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["locked_destination"]["name"] == "Myrtle Beach, SC"

    # Verify planning phase is now open
    phases_r = client.get(f"/trips/{trip['id']}/phases", headers={"Authorization": f"Bearer {token}"})
    phases = phases_r.json()
    planning = next(p for p in phases if p["phase"] == "planning")
    assert planning["status"] == "open"
