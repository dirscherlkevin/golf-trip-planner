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
