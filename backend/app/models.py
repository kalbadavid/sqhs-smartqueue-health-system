from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Boolean
from app.db import Base

class Patient(Base):
    __tablename__ = "patients"
    id          = Column(String(8), primary_key=True)
    name        = Column(String(120), nullable=False)
    phone       = Column(String(40), nullable=False)
    email       = Column(String(120), nullable=False)
    acuity      = Column(Integer, nullable=True)
    complaint   = Column(String(200), nullable=True)
    journey     = Column(String(2), nullable=True)
    path        = Column(JSON, nullable=False, default=list)   # list[str]
    cursor      = Column(Integer, nullable=False, default=0)
    arrived_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_drift    = Column(Boolean, default=False)               # synthetic patients

class QueueEntry(Base):
    __tablename__ = "queue_entries"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    station    = Column(String(20), nullable=False, index=True)
    patient_id = Column(String(8), nullable=False, index=True)
    position   = Column(Integer, nullable=False)
    enqueued_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class SMSLog(Base):
    __tablename__ = "sms_log"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(8), nullable=False, index=True)
    phone      = Column(String(40), nullable=False)
    body       = Column(String(2000), nullable=False)
    sent_at    = Column(DateTime, nullable=False, default=datetime.utcnow)
    provider   = Column(String(20), nullable=False, default="stub")

class EmailLog(Base):
    __tablename__ = "email_log"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(8), nullable=False, index=True)
    email      = Column(String(120), nullable=False)
    subject    = Column(String(200), nullable=False)
    body       = Column(String(4000), nullable=False)
    sent_at    = Column(DateTime, nullable=False, default=datetime.utcnow)
    provider   = Column(String(20), nullable=False, default="resend")

