import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

from main import app
from database import Base, get_db

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/golf_trip_planner_test"
)

test_engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def client():
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def auth_client(client):
    """Returns (client, token) for a registered test user."""
    r = client.post("/auth/register", json={
        "email": "dan@test.com", "name": "Dan", "password": "testpass123"
    })
    token = r.json()["access_token"]
    return client, token

@pytest.fixture
def db():
    """Raw DB session using the test database (tables already created by setup_db)."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
