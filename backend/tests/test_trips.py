def test_create_trip(auth_client):
    client, token = auth_client
    r = client.post("/trips", json={"name": "Scottsdale 2025"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Scottsdale 2025"
    assert len(data["members"]) == 1  # organizer auto-added

def test_list_trips_only_shows_joined(auth_client):
    client, token = auth_client
    client.post("/trips", json={"name": "Trip A"}, headers={"Authorization": f"Bearer {token}"})
    r = client.get("/trips", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1

def test_invite_and_join(auth_client, client):
    # Organizer creates trip and invites
    c, token = auth_client
    trip_r = c.post("/trips", json={"name": "Scottsdale"},
                    headers={"Authorization": f"Bearer {token}"})
    trip_id = trip_r.json()["id"]
    invite_r = c.post(f"/trips/{trip_id}/invite",
                      json={"email": "michael@test.com"},
                      headers={"Authorization": f"Bearer {token}"})
    assert invite_r.status_code == 200
    invite_token = invite_r.json()["invite_token"]

    # New user registers and joins via token
    reg = client.post("/auth/register", json={
        "email": "michael@test.com", "name": "Michael", "password": "pass123"
    })
    michael_token = reg.json()["access_token"]
    join_r = client.post(f"/trips/join/{invite_token}",
                         headers={"Authorization": f"Bearer {michael_token}"})
    assert join_r.status_code == 200
    assert len(join_r.json()["members"]) == 2

def test_non_member_cannot_access_trip(auth_client, client):
    c, token = auth_client
    trip_r = c.post("/trips", json={"name": "Private Trip"},
                    headers={"Authorization": f"Bearer {token}"})
    trip_id = trip_r.json()["id"]

    other = client.post("/auth/register", json={
        "email": "other@test.com", "name": "Other", "password": "pass123"
    })
    other_token = other.json()["access_token"]
    r = client.get(f"/trips/{trip_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert r.status_code == 403

def test_trip_list_includes_current_phase(client):
    r = client.post("/auth/register", json={"email": "phase@test.com", "name": "Phase", "password": "pw"})
    token = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Phase Trip"}, headers={"Authorization": f"Bearer {token}"}).json()

    trips = client.get("/trips", headers={"Authorization": f"Bearer {token}"}).json()
    t = next(x for x in trips if x["id"] == trip["id"])

    assert "current_phase" in t
    assert t["current_phase"] == "availability"  # new trips start in availability
    assert "user_action_pending" in t
    assert t["user_action_pending"] == True  # user hasn't submitted availability yet

def test_get_trip_includes_current_phase(client):
    r = client.post("/auth/register", json={"email": "phase2@test.com", "name": "Phase2", "password": "pw"})
    token = r.json()["access_token"]
    trip = client.post("/trips", json={"name": "Phase Trip 2"}, headers={"Authorization": f"Bearer {token}"}).json()
    trip_id = trip["id"]

    t = client.get(f"/trips/{trip_id}", headers={"Authorization": f"Bearer {token}"}).json()

    assert "current_phase" in t
    assert t["current_phase"] == "availability"
    assert "user_action_pending" in t
    assert t["user_action_pending"] == True
