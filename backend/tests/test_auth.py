def test_register_returns_token(client):
    r = client.post("/auth/register", json={
        "email": "dan@test.com", "name": "Dan", "password": "testpass123"
    })
    assert r.status_code == 200
    assert "access_token" in r.json()

def test_register_duplicate_email_rejected(client):
    client.post("/auth/register", json={"email": "dan@test.com", "name": "Dan", "password": "testpass123"})
    r = client.post("/auth/register", json={"email": "dan@test.com", "name": "Dan2", "password": "other"})
    assert r.status_code == 400

def test_login_with_valid_credentials(client):
    client.post("/auth/register", json={"email": "dan@test.com", "name": "Dan", "password": "testpass123"})
    r = client.post("/auth/login", data={"username": "dan@test.com", "password": "testpass123"})
    assert r.status_code == 200
    assert "access_token" in r.json()

def test_login_with_wrong_password(client):
    client.post("/auth/register", json={"email": "dan@test.com", "name": "Dan", "password": "testpass123"})
    r = client.post("/auth/login", data={"username": "dan@test.com", "password": "wrongpass"})
    assert r.status_code == 400

def test_me_returns_current_user(auth_client):
    client, token = auth_client
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "dan@test.com"
    assert r.json()["name"] == "Dan"

def test_me_with_invalid_token(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer badtoken"})
    assert r.status_code == 401
