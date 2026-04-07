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
