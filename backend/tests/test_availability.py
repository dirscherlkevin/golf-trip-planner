def test_submit_availability(auth_client):
    client, token = auth_client
    trip = client.post("/trips", json={"name": "Test Trip"},
                       headers={"Authorization": f"Bearer {token}"}).json()
    r = client.post(f"/trips/{trip['id']}/availability",
                    json={"date_ranges": [{"start_date": "2025-10-16", "end_date": "2025-10-20"}]},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

def test_overlap_reflects_single_member(auth_client):
    client, token = auth_client
    trip = client.post("/trips", json={"name": "Test Trip"},
                       headers={"Authorization": f"Bearer {token}"}).json()
    client.post(f"/trips/{trip['id']}/availability",
                json={"date_ranges": [{"start_date": "2025-10-16", "end_date": "2025-10-18"}]},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/trips/{trip['id']}/availability/overlap",
                   headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total_members"] == 1
    assert len(data["days"]) == 3  # Oct 16, 17, 18
    assert all(d["count"] == 1 for d in data["days"])

def test_submit_availability_replaces_previous(auth_client):
    client, token = auth_client
    trip = client.post("/trips", json={"name": "Test Trip"},
                       headers={"Authorization": f"Bearer {token}"}).json()
    client.post(f"/trips/{trip['id']}/availability",
                json={"date_ranges": [{"start_date": "2025-10-16", "end_date": "2025-10-20"}]},
                headers={"Authorization": f"Bearer {token}"})
    # Submit again with different dates — should replace, not accumulate
    client.post(f"/trips/{trip['id']}/availability",
                json={"date_ranges": [{"start_date": "2025-11-01", "end_date": "2025-11-03"}]},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/trips/{trip['id']}/availability/overlap",
                   headers={"Authorization": f"Bearer {token}"})
    dates = [d["date"] for d in r.json()["days"]]
    assert "2025-10-16" not in dates
    assert "2025-11-01" in dates

def test_invalid_date_range_rejected(auth_client):
    client, token = auth_client
    trip = client.post("/trips", json={"name": "Test Trip"},
                       headers={"Authorization": f"Bearer {token}"}).json()
    r = client.post(f"/trips/{trip['id']}/availability",
                    json={"date_ranges": [{"start_date": "2025-10-20", "end_date": "2025-10-16"}]},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 422
