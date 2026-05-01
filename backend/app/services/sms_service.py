"""Stubbed SMS — logs to console and persists to DB. No real sending."""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import SMSLog
from app.config import settings

log = logging.getLogger(__name__)

def format_journey_sms(patient_name: str, stages: list, estimated_finish: str) -> str:
    lines = [f"Hello {patient_name.split()[0]}, your visit summary:"]
    for s in stages:
        if s["status"] == "done":
            lines.append(f"✓ {s['station'].title()} — done")
        elif s["status"] == "current":
            lines.append(f"→ {s['station'].title()} — Position #{s.get('position', '?')}")
            lines.append(f"   est. {s['estStart']} — {s['estEnd']}")
        else:
            lines.append(f"· {s['station'].title()} — Position #{s.get('position', '?')}")
            lines.append(f"   est. {s['estStart']} — {s['estEnd']}")
    lines.append("")
    lines.append(f"Estimated finish: {estimated_finish}")
    lines.append("You may leave the premises. We will text you 15 min before each step.")
    return "\n".join(lines)

def send_sms(db: Session, patient_id: str, phone: str, body: str) -> SMSLog:
    """Stub: log to console + persist. Future: dispatch via Africa's Talking."""
    log.info(f"[SMS STUB → {phone}]\n{body}\n{'-'*40}")
    record = SMSLog(
        patient_id=patient_id, phone=phone, body=body,
        sent_at=datetime.utcnow(), provider=settings.sms_provider,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
