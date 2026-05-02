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
    lab_status  = Column(String(20), nullable=True)            # pending_results
    lab_status_at = Column(DateTime, nullable=True)            # when sample collected

class QueueEntry(Base):
    __tablename__ = "queue_entries"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    station    = Column(String(20), nullable=False, index=True)
    patient_id = Column(String(8), nullable=False, index=True)
    position   = Column(Integer, nullable=False)
    enqueued_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    called_at   = Column(DateTime, nullable=True)   # set when position <= servers
    entered_at  = Column(DateTime, nullable=True)   # set when patient enters room

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

class DailyStationLog(Base):
    __tablename__ = "daily_station_logs"
    id               = Column(Integer, primary_key=True, autoincrement=True)
    date             = Column(DateTime, nullable=False, index=True) # Usually the date component
    station          = Column(String(20), nullable=False, index=True)
    total_patients   = Column(Integer, nullable=False, default=0)
    avg_wait_minutes = Column(Float, nullable=False, default=0.0)
    max_wait_minutes = Column(Float, nullable=False, default=0.0)

