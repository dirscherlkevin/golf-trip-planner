import pytest


def _register(client, email, name, password="testpass123"):
    r = client.post("/auth/register", json={"email": email, "name": name, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_search_requires_auth(client):
    """Unauthenticated search returns 401."""
    _register(client, "unauth@test.com", "Unauth User")
    r = client.get("/users/search?q=unauth")
    assert r.status_code == 401


def test_search_finds_users_by_email(client):
    """Authenticated user can find any registered user by email fragment."""
    token_alice = _register(client, "alice@test.com", "Alice Smith")
    _register(client, "bob@test.com", "Bob Jones")

    r = client.get("/users/search?q=bob", headers={"Authorization": f"Bearer {token_alice}"})
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert "bob@test.com" in emails


def test_search_finds_users_by_name(client):
    """Authenticated user can search by first or last name."""
    token_carol = _register(client, "carol@test.com", "Carol Williams")
    _register(client, "dave@test.com", "Dave Johnson")

    r = client.get("/users/search?q=Dave", headers={"Authorization": f"Bearer {token_carol}"})
    assert r.status_code == 200
    names = [u["name"] for u in r.json()]
    assert "Dave Johnson" in names

    r2 = client.get("/users/search?q=Johnson", headers={"Authorization": f"Bearer {token_carol}"})
    assert r2.status_code == 200
    assert "Dave Johnson" in [u["name"] for u in r2.json()]


def test_search_excludes_caller(client):
    """Search never returns the caller themselves."""
    token_eve = _register(client, "eve@test.com", "Eve Adams")

    r = client.get("/users/search?q=eve", headers={"Authorization": f"Bearer {token_eve}"})
    assert r.status_code == 200
    assert "eve@test.com" not in [u["email"] for u in r.json()]
