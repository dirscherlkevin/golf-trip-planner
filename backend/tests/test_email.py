"""Tests for services/email.py — queue, send, worker logic."""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

from models.user import User
from models.trip import Trip, TripMember
from models.phase import TripPhase, PhaseName, PhaseStatus
from models.availability import AvailabilityResponse
from models.email_queue import EmailQueue, EmailStatus
from services.email import enqueue_email, process_email_queue, check_and_enqueue_reminders


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(db, email="test@test.com", name="Test"):
    u = User(email=email, name=name, hashed_password="x")
    db.add(u)
    db.flush()
    return u


def _make_trip(db, organizer_id, name="Test Trip"):
    t = Trip(name=name, organizer_id=organizer_id)
    db.add(t)
    db.flush()
    return t


# ---------------------------------------------------------------------------
# Test 1: enqueue_email creates a row
# ---------------------------------------------------------------------------

def test_enqueue_email_creates_row(db):
    user = _make_user(db, "member@test.com")
    trip = _make_trip(db, user.id)
    db.commit()

    enqueue_email(db, trip.id, user.id, "availability_reminder", {"trip_name": "Augusta Trip"})

    rows = db.query(EmailQueue).filter(EmailQueue.trip_id == trip.id).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.recipient_user_id == user.id
    assert row.template == "availability_reminder"
    assert row.status == EmailStatus.pending
    assert row.attempts == 0
    assert row.payload["trip_name"] == "Augusta Trip"


# ---------------------------------------------------------------------------
# Test 2: process_queue marks sent when SMTP succeeds
# ---------------------------------------------------------------------------

def test_process_queue_marks_sent(db):
    user = _make_user(db, "sent@test.com")
    trip = _make_trip(db, user.id)
    db.commit()

    enqueue_email(db, trip.id, user.id, "availability_reminder", {"trip_name": "Masters Trip"})

    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_smtp = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
        process_email_queue(db)

    row = db.query(EmailQueue).filter(EmailQueue.trip_id == trip.id).first()
    assert row.status == EmailStatus.sent


# ---------------------------------------------------------------------------
# Test 3: process_queue increments attempts on SMTP failure (stays pending)
# ---------------------------------------------------------------------------

def test_process_queue_retries_on_failure(db):
    user = _make_user(db, "retry@test.com")
    trip = _make_trip(db, user.id)
    db.commit()

    enqueue_email(db, trip.id, user.id, "availability_reminder", {"trip_name": "Retry Trip"})

    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_smtp_cls.side_effect = Exception("Connection refused")
        process_email_queue(db)

    row = db.query(EmailQueue).filter(EmailQueue.trip_id == trip.id).first()
    assert row.attempts == 1
    assert row.status == EmailStatus.pending


# ---------------------------------------------------------------------------
# Test 4: process_queue marks failed after 3 attempts
# ---------------------------------------------------------------------------

def test_process_queue_fails_after_3_attempts(db):
    user = _make_user(db, "fail@test.com")
    trip = _make_trip(db, user.id)
    db.commit()

    # Insert a row that already has 2 attempts (one more failure → failed)
    row = EmailQueue(
        trip_id=trip.id,
        recipient_user_id=user.id,
        template="availability_reminder",
        payload={"trip_name": "Fail Trip"},
        status=EmailStatus.pending,
        send_after=datetime.now(timezone.utc),
        attempts=2,
    )
    db.add(row)
    db.commit()

    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_smtp_cls.side_effect = Exception("Still failing")
        process_email_queue(db)

    db.refresh(row)
    assert row.attempts == 3
    assert row.status == EmailStatus.failed


# ---------------------------------------------------------------------------
# Test 5: reminder not enqueued if member already responded
# ---------------------------------------------------------------------------

def test_reminder_not_enqueued_if_already_responded(db):
    organizer = _make_user(db, "org@test.com", "Organizer")
    member = _make_user(db, "member2@test.com", "Member")
    trip = _make_trip(db, organizer.id, "Reminder Trip")

    # Add the member to the trip
    tm = TripMember(trip_id=trip.id, user_id=member.id, joined="joined")
    db.add(tm)

    # Add an open availability phase
    phase = TripPhase(trip_id=trip.id, phase=PhaseName.availability, status=PhaseStatus.open)
    db.add(phase)

    # Add an availability response for the member
    resp = AvailabilityResponse(
        trip_id=trip.id,
        user_id=member.id,
        date_ranges=[{"start": "2026-08-01", "end": "2026-08-05"}],
    )
    db.add(resp)
    db.commit()

    check_and_enqueue_reminders(db)

    count = db.query(EmailQueue).filter(
        EmailQueue.trip_id == trip.id,
        EmailQueue.template == "availability_reminder",
    ).count()
    assert count == 0
