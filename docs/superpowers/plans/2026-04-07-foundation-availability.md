# Foundation & Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the working foundation of the Golf Trip Planner — project scaffold, user auth, trip creation/invite, and group availability submission with a calendar heatmap UI (Step 1 of the 4-step wizard).

**Architecture:** FastAPI backend with SQLAlchemy + PostgreSQL, React (Vite) frontend with dark theme and Zustand state management. Auth uses JWT tokens. Backend exposes REST endpoints; frontend consumes them via Axios. Docker Compose runs PostgreSQL locally.

**Tech Stack:** Python 3.11, FastAPI 0.110, SQLAlchemy 2.0, Alembic, passlib[bcrypt], python-jose, React 18, Vite, Zustand, Axios, React Router 6, Vitest, pytest, httpx

---

## File Map

```
golf-trip-planner/
├── docker-compose.yml
├── .gitignore
├── .env.example
├── README.md
│
├── backend/
│   ├── main.py                        # FastAPI app, CORS, router registration
│   ├── database.py                    # SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── requirements.txt
│   ├── .env                           # (gitignored)
│   ├── pytest.ini
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py                    # POST /auth/register, POST /auth/login, GET /auth/me
│   │   └── trips.py                   # CRUD /trips, POST /trips/{id}/join, POST /trips/{id}/availability, GET /trips/{id}/availability/overlap
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                    # User table
│   │   ├── trip.py                    # Trip + TripMember tables
│   │   └── availability.py            # Availability table
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py                    # UserCreate, UserOut, Token
│   │   ├── trip.py                    # TripCreate, TripOut, TripMemberOut
│   │   └── availability.py            # AvailabilityCreate, OverlapOut
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth.py                    # hash_password, verify_password, create_access_token, get_user_from_token
│   │   └── availability.py            # compute_overlap(trip_id, db) -> dict[str, int]
│   └── tests/
│       ├── conftest.py                # TestClient fixture, test DB setup/teardown
│       ├── test_auth.py
│       ├── test_trips.py
│       └── test_availability.py
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx                   # ReactDOM.createRoot, Router
        ├── App.jsx                    # Routes: /, /login, /register, /trips/:id
        ├── index.css                  # Dark theme CSS variables + globals
        ├── api/
        │   └── client.js              # Axios instance with base URL + auth interceptor
        ├── store/
        │   └── auth.js                # Zustand: user, token, login(), logout()
        ├── components/
        │   ├── StepNav.jsx            # 4-step progress bar (step number prop)
        │   ├── MemberSidebar.jsx      # Group member list + invite link copy button
        │   └── AvailabilityCalendar.jsx  # Calendar grid with heatmap coloring
        └── pages/
            ├── Login.jsx
            ├── Register.jsx
            ├── Dashboard.jsx          # Trip list + create trip form
            └── TripPage.jsx           # Shell: loads trip, shows StepNav + AvailabilityStep
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: golf_trip_planner
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  db_test:
    image: postgres:15
    environment:
      POSTGRES_DB: golf_trip_planner_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5433:5432"
    volumes:
      - pgdata_test:/var/lib/postgresql/data

volumes:
  pgdata:
  pgdata_test:
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
__pycache__/
*.pyc
.env
*.db
.superpowers/
.venv/
dist/
.DS_Store
*.egg-info/
.pytest_cache/
```

- [ ] **Step 3: Create .env.example**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/golf_trip_planner
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/golf_trip_planner_test
SECRET_KEY=change-this-to-a-random-secret-in-production
GOOGLE_PLACES_API_KEY=your-google-places-api-key-here
```

- [ ] **Step 4: Create README.md**

```markdown
# Golf Trip Planner

Collaborative web app for planning golf trips with a group. Built with FastAPI + React.

## Quick Start

### Prerequisites
- Docker Desktop
- Node.js 18+
- Python 3.11+

### 1. Start the database
```bash
docker compose up -d db db_test
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env    # edit .env with your values
uvicorn main:app --reload
```
API runs at http://localhost:8000. Docs at http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs at http://localhost:5173

### 4. Run backend tests
```bash
cd backend
pytest
```

## Architecture
See `docs/superpowers/specs/2026-04-07-golf-trip-planner-design.md`

## Implementation Plan
See `docs/superpowers/plans/2026-04-07-foundation-availability.md`
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore .env.example README.md
git commit -m "chore: add project scaffold (docker-compose, gitignore, README)"
```

---

## Task 2: Backend Foundation

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/database.py`
- Create: `backend/main.py`
- Create: `backend/api/__init__.py`
- Create: `backend/models/__init__.py`
- Create: `backend/schemas/__init__.py`
- Create: `backend/services/__init__.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Create backend/requirements.txt**

```
fastapi==0.110.0
uvicorn[standard]==0.27.1
sqlalchemy==2.0.27
psycopg2-binary==2.9.9
alembic==1.13.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
pydantic[email]==2.6.1
python-dotenv==1.0.1
httpx==0.27.0
pytest==8.0.2
pytest-asyncio==0.23.5
```

- [ ] **Step 2: Create backend/database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/golf_trip_planner")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Create backend/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base

# Import models so Base.metadata knows about them
import models.user  # noqa
import models.trip  # noqa
import models.availability  # noqa

app = FastAPI(title="Golf Trip Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Routers registered in later tasks
```

- [ ] **Step 4: Create empty __init__.py files**

```bash
touch backend/api/__init__.py backend/models/__init__.py backend/schemas/__init__.py backend/services/__init__.py
mkdir -p backend/tests && touch backend/tests/__init__.py
```

- [ ] **Step 5: Create backend/pytest.ini**

```ini
[pytest]
testpaths = tests
```

- [ ] **Step 6: Install dependencies and verify server starts**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Expected: Server starts on http://localhost:8000 with no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add backend foundation (FastAPI, SQLAlchemy, database setup)"
```

---

## Task 3: User Model & Auth Service

**Files:**
- Create: `backend/models/user.py`
- Create: `backend/schemas/user.py`
- Create: `backend/services/auth.py`

- [ ] **Step 1: Create backend/models/user.py**

```python
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Create backend/schemas/user.py**

```python
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str
```

- [ ] **Step 3: Create backend/services/auth.py**

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from models.user import User
import os

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
        return db.query(User).filter(User.id == user_id).first()
    except (JWTError, ValueError):
        return None
```

- [ ] **Step 4: Commit**

```bash
git add backend/models/user.py backend/schemas/user.py backend/services/auth.py
git commit -m "feat: add User model and auth service (JWT, bcrypt)"
```

---

## Task 4: Auth API Endpoints & Tests

**Files:**
- Create: `backend/api/auth.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create backend/api/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserOut, Token
from services.auth import hash_password, verify_password, create_access_token, get_user_from_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = get_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user

@router.post("/register", response_model=Token)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id), token_type="bearer")

@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.id), token_type="bearer")

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

- [ ] **Step 2: Register auth router in backend/main.py**

Add these lines after the middleware block:

```python
from api.auth import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["auth"])
```

- [ ] **Step 3: Create backend/tests/conftest.py**

```python
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
```

- [ ] **Step 4: Write failing tests in backend/tests/test_auth.py**

```python
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
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
cd backend && pytest tests/test_auth.py -v
```

Expected: All 6 tests FAIL (auth router not registered yet or no DB).

- [ ] **Step 6: Run tests — verify they pass after implementation**

```bash
pytest tests/test_auth.py -v
```

Expected:
```
PASSED tests/test_auth.py::test_register_returns_token
PASSED tests/test_auth.py::test_register_duplicate_email_rejected
PASSED tests/test_auth.py::test_login_with_valid_credentials
PASSED tests/test_auth.py::test_login_with_wrong_password
PASSED tests/test_auth.py::test_me_returns_current_user
PASSED tests/test_auth.py::test_me_with_invalid_token
```

- [ ] **Step 7: Commit**

```bash
git add backend/api/auth.py backend/tests/conftest.py backend/tests/test_auth.py backend/main.py
git commit -m "feat: add user auth endpoints (register, login, me) with tests"
```

---

## Task 5: Trip Model & CRUD API

**Files:**
- Create: `backend/models/trip.py`
- Create: `backend/schemas/trip.py`
- Create: `backend/api/trips.py`
- Create: `backend/tests/test_trips.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create backend/models/trip.py**

```python
import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class TripStatus(str, enum.Enum):
    planning = "planning"
    finalized = "finalized"

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    organizer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(TripStatus), default=TripStatus.planning, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    members = relationship("TripMember", back_populates="trip", cascade="all, delete-orphan")

class TripMember(Base):
    __tablename__ = "trip_members"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null until invite accepted
    invite_token = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    invite_email = Column(String, nullable=True)
    joined = Column(String, nullable=False, default="pending")  # pending | joined
    joined_at = Column(DateTime(timezone=True), nullable=True)

    trip = relationship("Trip", back_populates="members")
```

- [ ] **Step 2: Create backend/schemas/trip.py**

```python
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class TripCreate(BaseModel):
    name: str

class TripMemberOut(BaseModel):
    id: int
    invite_email: Optional[str]
    joined: str
    user_id: Optional[int]

    model_config = {"from_attributes": True}

class TripOut(BaseModel):
    id: int
    name: str
    organizer_id: int
    status: str
    created_at: datetime
    members: list[TripMemberOut]

    model_config = {"from_attributes": True}

class InviteCreate(BaseModel):
    email: EmailStr

class InviteOut(BaseModel):
    invite_token: str
    invite_url: str
```

- [ ] **Step 3: Create backend/api/trips.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.trip import Trip, TripMember
from models.user import User
from schemas.trip import TripCreate, TripOut, InviteCreate, InviteOut
from api.auth import get_current_user
import uuid

router = APIRouter()

@router.post("", response_model=TripOut)
def create_trip(data: TripCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = Trip(name=data.name, organizer_id=user.id)
    db.add(trip)
    db.flush()
    # Add organizer as first member (already joined)
    member = TripMember(
        trip_id=trip.id,
        user_id=user.id,
        invite_email=user.email,
        joined="joined",
    )
    db.add(member)
    db.commit()
    db.refresh(trip)
    return trip

@router.get("", response_model=list[TripOut])
def list_trips(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member_trip_ids = db.query(TripMember.trip_id).filter(
        TripMember.user_id == user.id, TripMember.joined == "joined"
    ).subquery()
    return db.query(Trip).filter(Trip.id.in_(member_trip_ids)).all()

@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)
    return trip

@router.post("/{trip_id}/invite", response_model=InviteOut)
def invite_member(trip_id: int, data: InviteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = _get_trip_for_member(trip_id, user.id, db)
    if trip.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can invite members")
    token = str(uuid.uuid4())
    member = TripMember(trip_id=trip_id, invite_email=data.email, invite_token=token)
    db.add(member)
    db.commit()
    return InviteOut(invite_token=token, invite_url=f"http://localhost:5173/join/{token}")

@router.post("/join/{invite_token}", response_model=TripOut)
def join_trip(invite_token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    member = db.query(TripMember).filter(TripMember.invite_token == invite_token).first()
    if not member:
        raise HTTPException(status_code=404, detail="Invite not found")
    if member.joined == "joined":
        raise HTTPException(status_code=400, detail="Invite already used")
    member.user_id = user.id
    member.joined = "joined"
    db.commit()
    db.refresh(member)
    return member.trip

def _get_trip_for_member(trip_id: int, user_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.user_id == user_id, TripMember.joined == "joined"
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip
```

- [ ] **Step 4: Register trips router in backend/main.py**

Add after the auth router line:

```python
from api.trips import router as trips_router
app.include_router(trips_router, prefix="/trips", tags=["trips"])
```

- [ ] **Step 5: Write failing tests in backend/tests/test_trips.py**

```python
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
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
pytest tests/test_trips.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/models/trip.py backend/schemas/trip.py backend/api/trips.py backend/tests/test_trips.py backend/main.py
git commit -m "feat: add Trip model, CRUD endpoints, invite/join flow with tests"
```

---

## Task 6: Availability Model, Service & API

**Files:**
- Create: `backend/models/availability.py`
- Create: `backend/schemas/availability.py`
- Create: `backend/services/availability.py`
- Create: `backend/tests/test_availability.py`
- Modify: `backend/api/trips.py`

- [ ] **Step 1: Create backend/models/availability.py**

```python
from sqlalchemy import Column, Integer, ForeignKey, Date
from sqlalchemy.orm import relationship
from database import Base

class Availability(Base):
    __tablename__ = "availability"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
```

- [ ] **Step 2: Create backend/schemas/availability.py**

```python
from pydantic import BaseModel, model_validator
from datetime import date

class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

class AvailabilityCreate(BaseModel):
    date_ranges: list[DateRange]

class OverlapDay(BaseModel):
    date: date
    count: int  # number of members available on this day

class OverlapOut(BaseModel):
    days: list[OverlapDay]
    total_members: int
```

- [ ] **Step 3: Create backend/services/availability.py**

```python
from datetime import date, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session
from models.availability import Availability
from models.trip import TripMember

def compute_overlap(trip_id: int, db: Session) -> dict:
    """Returns {date: member_count} for all dates covered by any member's availability."""
    ranges = db.query(Availability).filter(Availability.trip_id == trip_id).all()
    total_members = db.query(TripMember).filter(
        TripMember.trip_id == trip_id, TripMember.joined == "joined"
    ).count()

    counts: dict[date, int] = defaultdict(int)
    for avail in ranges:
        current = avail.start_date
        while current <= avail.end_date:
            counts[current] += 1
            current += timedelta(days=1)

    days = [{"date": d, "count": c} for d, c in sorted(counts.items())]
    return {"days": days, "total_members": total_members}
```

- [ ] **Step 4: Add availability endpoints to backend/api/trips.py**

Add these imports at the top of `backend/api/trips.py`:

```python
from models.availability import Availability
from schemas.availability import AvailabilityCreate, OverlapOut
from services.availability import compute_overlap
from datetime import datetime
```

Add these two endpoints at the bottom of `backend/api/trips.py`:

```python
@router.post("/{trip_id}/availability", status_code=204)
def submit_availability(
    trip_id: int,
    data: AvailabilityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_trip_for_member(trip_id, user.id, db)
    # Delete previous submission for this user on this trip
    db.query(Availability).filter(
        Availability.trip_id == trip_id, Availability.user_id == user.id
    ).delete()
    for r in data.date_ranges:
        db.add(Availability(trip_id=trip_id, user_id=user.id, start_date=r.start_date, end_date=r.end_date))
    db.commit()

@router.get("/{trip_id}/availability/overlap", response_model=OverlapOut)
def get_overlap(trip_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_trip_for_member(trip_id, user.id, db)
    return compute_overlap(trip_id, db)
```

- [ ] **Step 5: Write failing tests in backend/tests/test_availability.py**

```python
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
```

- [ ] **Step 6: Run all tests — verify they pass**

```bash
pytest -v
```

Expected: All tests pass (auth + trips + availability).

- [ ] **Step 7: Commit**

```bash
git add backend/models/availability.py backend/schemas/availability.py backend/services/availability.py backend/tests/test_availability.py backend/api/trips.py
git commit -m "feat: add availability model, overlap computation, and API endpoints with tests"
```

---

## Task 7: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/store/auth.js`

- [ ] **Step 1: Scaffold with Vite**

```bash
cd ~/golf-trip-planner
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install axios react-router-dom zustand
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Update frontend/vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/trips': 'http://localhost:8000',
    }
  }
})
```

- [ ] **Step 3: Create frontend/src/test-setup.js**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Replace frontend/src/index.css with dark theme**

```css
:root {
  --bg-base: #0d1117;
  --bg-card: #1a1f2e;
  --bg-input: #1a202c;
  --bg-hover: #2d3748;
  --border: #2d3748;
  --text-primary: #e2e8f0;
  --text-secondary: #a0aec0;
  --text-muted: #4a5568;
  --accent-green: #68d391;
  --accent-blue: #90cdf4;
  --accent-amber: #f6ad55;
  --accent-purple: #b794f4;
  --btn-primary: #2b6cb0;
  --btn-primary-hover: #2c5282;
  --step-active: #68d391;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

input, select, textarea {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 8px 12px;
  width: 100%;
  font-size: 14px;
}

input:focus, select:focus { outline: 2px solid var(--btn-primary); }

button {
  cursor: pointer;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
}

.btn-primary { background: var(--btn-primary); color: #fff; }
.btn-primary:hover { background: var(--btn-primary-hover); }
.btn-ghost { background: transparent; color: var(--accent-blue); border: 1px solid var(--border); }

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
}

.label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

a { color: var(--accent-blue); text-decoration: none; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 5: Create frontend/src/api/client.js**

```js
import axios from 'axios'

const client = axios.create({ baseURL: '/' })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
```

- [ ] **Step 6: Create frontend/src/store/auth.js**

```js
import { create } from 'zustand'
import client from '../api/client'

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),

  login: async (email, password) => {
    const form = new URLSearchParams({ username: email, password })
    const { data } = await client.post('/auth/login', form)
    localStorage.setItem('token', data.access_token)
    const me = await client.get('/auth/me')
    set({ token: data.access_token, user: me.data })
  },

  register: async (email, name, password) => {
    const { data } = await client.post('/auth/register', { email, name, password })
    localStorage.setItem('token', data.access_token)
    const me = await client.get('/auth/me')
    set({ token: data.access_token, user: me.data })
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  fetchMe: async () => {
    try {
      const { data } = await client.get('/auth/me')
      set({ user: data })
    } catch {
      set({ user: null, token: null })
    }
  },
}))
```

- [ ] **Step 7: Create frontend/src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 8: Create frontend/src/App.jsx**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import TripPage from './pages/TripPage'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  useEffect(() => { fetchMe() }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/trips/:id" element={<PrivateRoute><TripPage /></PrivateRoute>} />
    </Routes>
  )
}
```

- [ ] **Step 9: Verify frontend starts**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server starts on http://localhost:5173 with no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: add React frontend scaffold (Vite, dark theme, Zustand auth store, Axios client)"
```

---

## Task 8: Auth UI (Login & Register)

**Files:**
- Create: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/pages/Register.jsx`

- [ ] **Step 1: Create frontend/src/pages/Login.jsx**

```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginBottom: 4, color: 'var(--accent-green)' }}>⛳ Golf Trip Planner</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Sign in to your account</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label">Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <div className="label">Password</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: 'var(--accent-amber)', fontSize: 13 }}>{error}</p>}
          <button type="submit" className="btn-primary">Sign In</button>
        </form>
        <p style={{ marginTop: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>
          No account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/pages/Register.jsx**

```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function Register() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await register(email, name, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginBottom: 4, color: 'var(--accent-green)' }}>⛳ Golf Trip Planner</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Create your account</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label">Name</div>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <div className="label">Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <div className="label">Password</div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p style={{ color: 'var(--accent-amber)', fontSize: 13 }}>{error}</p>}
          <button type="submit" className="btn-primary">Create Account</button>
        </form>
        <p style={{ marginTop: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify login and register pages render**

Open http://localhost:5173/login — should show the sign-in form on the dark background.
Open http://localhost:5173/register — should show the registration form.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/src/pages/Register.jsx
git commit -m "feat: add login and register UI pages"
```

---

## Task 9: Trip Dashboard

**Files:**
- Create: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/components/StepNav.jsx`

- [ ] **Step 1: Create frontend/src/components/StepNav.jsx**

```jsx
const STEPS = ['Availability', 'Location', 'Courses', 'Recommend']

export default function StepNav({ current }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      {STEPS.map((label, i) => {
        const num = i + 1
        const isActive = num === current
        const isDone = num < current
        return (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px',
              fontSize: 12,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? 'var(--step-active)' : isDone ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderBottom: isActive ? '2px solid var(--step-active)' : '2px solid transparent',
            }}
          >
            {isDone ? '✓ ' : `${num}. `}{label}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/pages/Dashboard.jsx**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/trips').then((r) => { setTrips(r.data); setLoading(false) })
  }, [])

  const createTrip = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const { data } = await client.post('/trips', { name: newName })
    setTrips([...trips, data])
    setNewName('')
    navigate(`/trips/${data.id}`)
  }

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ color: 'var(--accent-green)', fontSize: 22 }}>⛳ Golf Trip Planner</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{user?.name}</span>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>Sign Out</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="label">Start a New Trip</div>
        <form onSubmit={createTrip} style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Trip name (e.g. Scottsdale 2025)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>Create Trip</button>
        </form>
      </div>

      <div className="label" style={{ marginBottom: 12 }}>Your Trips</div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : trips.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No trips yet — create your first one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => navigate(`/trips/${trip.id}`)}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{trip.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {trip.members.length} member{trip.members.length !== 1 ? 's' : ''} · {trip.status}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify dashboard renders**

Register a user at http://localhost:5173/register, then confirm you land on the dashboard. Create a trip — it should appear in the list and navigate to `/trips/{id}` (shows blank page for now).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/components/StepNav.jsx
git commit -m "feat: add trip dashboard (list + create) and StepNav component"
```

---

## Task 10: Availability Step UI

**Files:**
- Create: `frontend/src/components/MemberSidebar.jsx`
- Create: `frontend/src/components/AvailabilityCalendar.jsx`
- Create: `frontend/src/pages/TripPage.jsx`

- [ ] **Step 1: Create frontend/src/components/MemberSidebar.jsx**

```jsx
import { useState } from 'react'
import client from '../api/client'

export default function MemberSidebar({ trip, onInviteSent }) {
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const sendInvite = async (e) => {
    e.preventDefault()
    const { data } = await client.post(`/trips/${trip.id}/invite`, { email })
    setInviteUrl(data.invite_url)
    setEmail('')
    if (onInviteSent) onInviteSent()
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const joined = trip.members.filter((m) => m.joined === 'joined')
  const pending = trip.members.filter((m) => m.joined === 'pending')

  const COLORS = ['#2b6cb0', '#553c9a', '#285e61', '#744210', '#276749', '#c05621']

  return (
    <div style={{ width: 220, padding: 16, background: '#0f1923', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
      <div className="label" style={{ marginBottom: 12 }}>Group Members</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {trip.members.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: COLORS[i % COLORS.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {(m.invite_email || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{m.invite_email || 'Pending'}</div>
              <div style={{ fontSize: 10, color: m.joined === 'joined' ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                {m.joined === 'joined' ? '✓ Joined' : '⏳ Pending'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendInvite} style={{ marginBottom: 12 }}>
        <div className="label">Invite by Email</div>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@email.com" required style={{ marginBottom: 6 }}
        />
        <button type="submit" className="btn-primary" style={{ width: '100%', fontSize: 12 }}>Send Invite</button>
      </form>

      {inviteUrl && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Share this link:</div>
          <div style={{ fontSize: 10, color: 'var(--accent-blue)', wordBreak: 'break-all', marginBottom: 6 }}>{inviteUrl}</div>
          <button className="btn-ghost" onClick={copyLink} style={{ width: '100%', fontSize: 11 }}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 12, background: 'var(--bg-card)', borderRadius: 6, padding: 8, textAlign: 'center', fontSize: 11 }}>
        <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{joined.length}</span>
        <span style={{ color: 'var(--text-secondary)' }}> / {trip.members.length} responded</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create frontend/src/components/AvailabilityCalendar.jsx**

```jsx
import { useState, useEffect } from 'react'
import client from '../api/client'

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function heatmapColor(count, total) {
  if (count === 0) return { bg: '#1a202c', text: 'var(--text-muted)' }
  const ratio = count / total
  if (ratio === 1) return { bg: '#22543d', text: '#9ae6b4' }
  if (ratio >= 0.5) return { bg: '#276749', text: 'var(--accent-green)' }
  return { bg: '#744210', text: 'var(--accent-amber)' }
}

export default function AvailabilityCalendar({ tripId, totalMembers }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [overlap, setOverlap] = useState({})
  const [selectedDates, setSelectedDates] = useState(new Set())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    client.get(`/trips/${tripId}/availability/overlap`).then((r) => {
      const map = {}
      r.data.days.forEach((d) => { map[d.date] = d.count })
      setOverlap(map)
    })
  }, [tripId])

  const toggleDate = (dateStr) => {
    setSaved(false)
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  const saveAvailability = async () => {
    if (selectedDates.size === 0) return
    const sorted = [...selectedDates].sort()
    // Convert individual dates to ranges
    const ranges = []
    let start = sorted[0], prev = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]
      const prevDate = new Date(prev)
      const currDate = new Date(curr)
      const diff = (currDate - prevDate) / (1000 * 60 * 60 * 24)
      if (diff === 1) { prev = curr }
      else { ranges.push({ start_date: start, end_date: prev }); start = curr; prev = curr }
    }
    ranges.push({ start_date: start, end_date: prev })
    await client.post(`/trips/${tripId}/availability`, { date_ranges: ranges })
    setSaved(true)
    const r = await client.get(`/trips/${tripId}/availability/overlap`)
    const map = {}
    r.data.days.forEach((d) => { map[d.date] = d.count })
    setOverlap(map)
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' })
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div style={{ flex: 1, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="label">Group Availability — {monthName} {year}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}>
            ‹
          </button>
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}>
            ›
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 12 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
        ))}
        {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr = formatDate(year, month, day)
          const count = overlap[dateStr] || 0
          const { bg, text } = heatmapColor(count, totalMembers || 1)
          const isSelected = selectedDates.has(dateStr)
          return (
            <div
              key={day}
              onClick={() => toggleDate(dateStr)}
              style={{
                background: isSelected ? 'var(--btn-primary)' : bg,
                color: isSelected ? '#fff' : text,
                borderRadius: 4, padding: '6px 2px', textAlign: 'center',
                fontSize: 11, cursor: 'pointer', border: isSelected ? '2px solid var(--accent-blue)' : '2px solid transparent',
                fontWeight: count > 0 ? 600 : 400,
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['#22543d', '#9ae6b4', 'All available'], ['#276749', 'var(--accent-green)', 'Most available'],
          ['#744210', 'var(--accent-amber)', 'Some available'], ['#1a202c', 'var(--text-muted)', 'Unavailable']
        ].map(([bg, text, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, background: bg, borderRadius: 2 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Click dates to mark your availability
          {selectedDates.size > 0 && ` — ${selectedDates.size} day(s) selected`}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--accent-green)', fontSize: 12 }}>✓ Saved</span>}
          <button className="btn-primary" onClick={saveAvailability} disabled={selectedDates.size === 0}>
            Save My Availability
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create frontend/src/pages/TripPage.jsx**

```jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import StepNav from '../components/StepNav'
import MemberSidebar from '../components/MemberSidebar'
import AvailabilityCalendar from '../components/AvailabilityCalendar'

export default function TripPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadTrip = () => {
    client.get(`/trips/${id}`).then((r) => { setTrip(r.data); setLoading(false) })
  }

  useEffect(() => { loadTrip() }, [id])

  if (loading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading trip...</div>
  if (!trip) return <div style={{ padding: 40, color: 'var(--accent-amber)' }}>Trip not found.</div>

  const joinedMembers = trip.members.filter((m) => m.joined === 'joined').length

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, color: 'var(--accent-green)' }}>⛳ {trip.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{joinedMembers} member{joinedMembers !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <StepNav current={1} />
        <div style={{ display: 'flex', minHeight: 420 }}>
          <MemberSidebar trip={trip} onInviteSent={loadTrip} />
          <AvailabilityCalendar tripId={trip.id} totalMembers={joinedMembers} />
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            disabled={joinedMembers < 1}
            onClick={() => alert('Location step coming in Plan 2!')}
          >
            Next: Pick Location →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify full availability flow**

1. Register two users (use two browser tabs or incognito)
2. User 1 creates a trip, sends invite to User 2's email
3. User 2 registers, joins via the invite link
4. Both users submit availability dates — calendar heatmap should update with overlap colors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ frontend/src/pages/TripPage.jsx
git commit -m "feat: add availability step UI (calendar heatmap, member sidebar, invite flow)"
```

---

## Task 11: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
cd ~/golf-trip-planner
git push origin main
```

- [ ] **Step 2: Verify on GitHub**

Open https://github.com/hotrodbuick1973/golf-trip-planner — confirm all commits are visible and the file tree matches the File Map at the top of this plan.

---

## What's Next

- **Plan 2:** Course Discovery & Map — Overpass API integration, Google Places enrichment, Leaflet map with dark tile layer, filter sidebar, course voting (Steps 2 & 3 of the wizard)
- **Plan 3:** Recommendation Engine — Open-Meteo historical weather, scoring algorithm, top-3 date recommendations, weather chart (Step 4 of the wizard)
