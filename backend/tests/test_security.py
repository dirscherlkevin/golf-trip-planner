import pytest


def _register(client, email, name, password="testpass123"):
    r = client.post("/auth/register", json={"email": email, "name": name, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_search_returns_empty_for_strangers(client):
    """Users not sharing any trip must not appear in search results."""
    token_alice = _register(client, "alice@test.com", "Alice")
    _register(client, "bob@test.com", "Bob")

    r = client.get("/users/search?q=bob", headers={"Authorization": f"Bearer {token_alice}"})
    assert r.status_code == 200
    assert r.json() == []


def test_search_finds_shared_trip_members(client):
    """Users who joined the same trip as the caller appear in search results."""
    token_carol = _register(client, "carol@test.com", "Carol")
    token_dave = _register(client, "dave@test.com", "Dave")

    trip = client.post(
        "/trips", json={"name": "Scottsdale"},
        headers={"Authorization": f"Bearer {token_carol}"},
    ).json()
    client.post(
        f"/trips/{trip['id']}/invite", json={"email": "dave@test.com"},
        headers={"Authorization": f"Bearer {token_carol}"},
    )
    client.post(f"/trips/{trip['id']}/join", headers={"Authorization": f"Bearer {token_dave}"})

    r = client.get("/users/search?q=dave", headers={"Authorization": f"Bearer {token_carol}"})
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert "dave@test.com" in emails


def test_search_excludes_users_from_unrelated_trips(client):
    """A user in a different trip does not appear in search results."""
    token_eve = _register(client, "eve@test.com", "Eve")
    token_frank = _register(client, "frank@test.com", "Frank")
    _register(client, "grace@test.com", "Grace")

    trip_a = client.post(
        "/trips", json={"name": "Trip A"},
        headers={"Authorization": f"Bearer {token_eve}"},
    ).json()
    client.post(
        f"/trips/{trip_a['id']}/invite", json={"email": "frank@test.com"},
        headers={"Authorization": f"Bearer {token_eve}"},
    )
    client.post(f"/trips/{trip_a['id']}/join", headers={"Authorization": f"Bearer {token_frank}"})

    # Grace is registered but shares no trip with Eve
    r = client.get("/users/search?q=grace", headers={"Authorization": f"Bearer {token_eve}"})
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert "grace@test.com" not in emails
