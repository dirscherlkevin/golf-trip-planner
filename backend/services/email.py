import os
import smtplib
import logging
from email.mime.text import MIMEText
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from models.email_queue import EmailQueue, EmailStatus

logger = logging.getLogger(__name__)


def _render_email(template: str, payload: dict) -> tuple[str, str]:
    """Returns (subject, body) for the given template + payload dict."""
    if template == "availability_reminder":
        subject = f"Your availability is needed for {payload.get('trip_name', 'your golf trip')}"
        body = (
            f"Hey {payload.get('name', 'there')},\n\n"
            f"{payload.get('organizer_name', 'The organizer')} needs your availability for "
            f"the {payload.get('trip_name', 'golf trip')} trip.\n\n"
            f"Visit: {payload.get('url', '')}"
        )
    elif template == "trip_summary":
        subject = f"You're going! {payload.get('trip_name', 'Golf trip')} is locked in"
        body = (
            f"You're going!\n\n"
            f"{payload.get('trip_name', 'Golf trip')}\n"
            f"Dates: {payload.get('dates', 'TBD')}\n"
            f"Destination: {payload.get('destination', 'TBD')}\n"
            f"Courses: {payload.get('courses', 'TBD')}\n"
            f"Lodging: {payload.get('lodging_name', 'TBD')}\n\n"
            f"See the full trip: {payload.get('url', '')}"
        )
    else:
        subject = "Golf Trip Update"
        body = str(payload)
    return subject, body


def enqueue_email(
    db: Session,
    trip_id: int,
    recipient_user_id: int,
    template: str,
    payload: dict,
    send_after=None,
):
    if send_after is None:
        send_after = datetime.now(timezone.utc)
    row = EmailQueue(
        trip_id=trip_id,
        recipient_user_id=recipient_user_id,
        template=template,
        payload=payload,
        status=EmailStatus.pending,
        send_after=send_after,
        attempts=0,
    )
    db.add(row)
    db.commit()


def send_email(to_address: str, subject: str, body: str):
    """Send via SMTP. Raises on failure."""
    host = os.getenv("SMTP_HOST", "localhost")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("EMAIL_FROM", "noreply@golftrip.app")
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_address
    with smtplib.SMTP(host, port) as smtp:
        smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def process_email_queue(db: Session):
    """Process up to 10 pending emails."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(EmailQueue)
        .filter(EmailQueue.status == EmailStatus.pending)
        .filter(EmailQueue.send_after <= now)
        .filter(EmailQueue.attempts < 3)
        .limit(10)
        .all()
    )
    for row in rows:
        from models.user import User
        user = db.query(User).filter(User.id == row.recipient_user_id).first()
        if not user:
            row.status = EmailStatus.failed
            db.commit()
            continue
        subject, body = _render_email(row.template, row.payload or {})
        try:
            send_email(user.email, subject, body)
            row.status = EmailStatus.sent
        except Exception as e:
            logger.warning("Failed to send email %s: %s", row.id, e)
            row.attempts += 1
            if row.attempts >= 3:
                row.status = EmailStatus.failed
        db.commit()


def check_and_enqueue_reminders(db: Session):
    """Enqueue reminders for non-responders on open availability phases."""
    from models.phase import TripPhase, PhaseName, PhaseStatus
    from models.trip import TripMember
    from models.availability import AvailabilityResponse
    from models.user import User

    open_availability = db.query(TripPhase).filter(
        TripPhase.phase == PhaseName.availability,
        TripPhase.status == PhaseStatus.open,
    ).all()

    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)

    for phase in open_availability:
        trip_id = phase.trip_id
        # Get joined members with user accounts
        members = db.query(TripMember).filter(
            TripMember.trip_id == trip_id,
            TripMember.joined == "joined",
            TripMember.user_id.isnot(None),
        ).all()
        # Get user_ids who already responded
        responded = {
            r.user_id for r in db.query(AvailabilityResponse).filter(
                AvailabilityResponse.trip_id == trip_id
            ).all()
        }
        for member in members:
            if member.user_id in responded:
                continue
            # Check if reminder sent in last 3 days
            recent = db.query(EmailQueue).filter(
                EmailQueue.trip_id == trip_id,
                EmailQueue.recipient_user_id == member.user_id,
                EmailQueue.template == "availability_reminder",
                EmailQueue.created_at >= three_days_ago,
            ).first()
            if recent:
                continue
            # Get organizer info
            from models.trip import Trip
            trip = db.query(Trip).filter(Trip.id == trip_id).first()
            organizer = db.query(User).filter(User.id == trip.organizer_id).first() if trip else None
            member_user = db.query(User).filter(User.id == member.user_id).first()
            enqueue_email(db, trip_id, member.user_id, "availability_reminder", {
                "trip_name": trip.name if trip else "Golf Trip",
                "name": member_user.email if member_user else "there",
                "organizer_name": organizer.email if organizer else "The organizer",
                "url": f"https://golftrip.app/trips/{trip_id}",
            })


async def email_worker():
    import asyncio
    from database import SessionLocal
    while True:
        try:
            db = SessionLocal()
            try:
                process_email_queue(db)
                check_and_enqueue_reminders(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            raise  # let cancellation propagate — stops the worker on shutdown
        except Exception as e:
            logger.exception("Email worker error: %s", e)
        await asyncio.sleep(60)
