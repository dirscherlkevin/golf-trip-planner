import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from database import Base

def _utcnow():
    return datetime.now(timezone.utc)

class EmailStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"

class EmailQueue(Base):
    __tablename__ = "email_queue"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False, default=dict)
    status = Column(Enum(EmailStatus), nullable=False, default=EmailStatus.pending)
    send_after = Column(DateTime(timezone=True), server_default=func.now())
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), default=_utcnow)
