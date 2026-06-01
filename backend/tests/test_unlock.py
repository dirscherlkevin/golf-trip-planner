import pytest


def test_unlock_reopens_planning_phase(client, db):
    """After unlock, planning phase is open and locked_in is pending."""
    from models.phase import TripPhase, PhaseStatus, PhaseName
    from models.trip import Trip, TripStatus

    # Register and create trip
    r = client.post("/auth/register", json={"email": "unlocker@test.com", "name": "Unlocker", "password": "pw"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Unlock Test"}, headers={"Authorization": f"Bearer {token}"}).json()
    trip_id = trip["id"]

    # Directly set trip to finalized state via DB fixture
    t = db.query(Trip).filter(Trip.id == trip_id).first()
    t.status = TripStatus.finalized
    for phase in db.query(TripPhase).filter(TripPhase.trip_id == trip_id).all():
        phase.status = PhaseStatus.locked
    db.commit()

    # Call unlock
    r = client.post(f"/trips/{trip_id}/unlock", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200

    # Verify phases via DB
    db.expire_all()
    phases = {p.phase.value: p.status.value for p in db.query(TripPhase).filter(TripPhase.trip_id == trip_id).all()}

    assert phases.get("planning") == "open", f"Expected planning=open, got {phases}"
    assert phases.get("locked_in") == "pending", f"Expected locked_in=pending, got {phases}"


def test_lodging_skip_persists(client):
    """PATCH lodging-skipped sets trip.lodging_skipped = True."""
    r = client.post("/auth/register", json={"email": "skipper@test.com", "name": "Skipper", "password": "pw"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Skip Test"}, headers={"Authorization": f"Bearer {token}"}).json()
    trip_id = trip["id"]

    r = client.patch(f"/trips/{trip_id}/lodging-skipped", json={"skipped": True}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["lodging_skipped"] is True

    # Verify TripOut includes the field
    r = client.get(f"/trips/{trip_id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["lodging_skipped"] is True


def test_lodging_skip_non_organizer_forbidden(client):
    """Non-organizer cannot set lodging_skipped."""
    r = client.post("/auth/register", json={"email": "org2@test.com", "name": "Org2", "password": "pw"})
    token_org = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Perm Test"}, headers={"Authorization": f"Bearer {token_org}"}).json()
    trip_id = trip["id"]

    r2 = client.post("/auth/register", json={"email": "member2@test.com", "name": "Member2", "password": "pw"})
    token_member = r2.json()["access_token"]

    r = client.patch(f"/trips/{trip_id}/lodging-skipped", json={"skipped": True}, headers={"Authorization": f"Bearer {token_member}"})
    assert r.status_code == 403


def test_lodging_skip_toggle(client):
    """lodging_skipped can be set to False after True."""
    r = client.post("/auth/register", json={"email": "toggler@test.com", "name": "Toggler", "password": "pw"})
    token = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Toggle Test"}, headers={"Authorization": f"Bearer {token}"}).json()
    trip_id = trip["id"]

    # Set to True
    client.patch(f"/trips/{trip_id}/lodging-skipped", json={"skipped": True}, headers={"Authorization": f"Bearer {token}"})
    # Set back to False
    r = client.patch(f"/trips/{trip_id}/lodging-skipped", json={"skipped": False}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["lodging_skipped"] is False

    r = client.get(f"/trips/{trip_id}", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["lodging_skipped"] is False
