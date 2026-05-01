"""All queue manipulation goes through here."""
import secrets
import string
from datetime import datetime
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session
from app.models import Patient, QueueEntry
from app.services.journey import JOURNEYS, choose_journey
from app.ml.predict import predict_wait
from app.ml.loader import STATIONS

ALPHA = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
SERVERS = {"triage": 2, "doctor": 3, "lab": 2, "pharmacy": 2}

def _new_id(n: int = 6) -> str:
    return "".join(secrets.choice(ALPHA) for _ in range(n))

# ---------- Mutators ----------
def register_patient(db: Session, name: str, phone: str) -> Patient:
    pid = _new_id()
    while db.get(Patient, pid):  # collision safety
        pid = _new_id()
    p = Patient(id=pid, name=name, phone=phone, path=["triage"], cursor=0,
                arrived_at=datetime.utcnow())
    db.add(p)
    db.flush()
    _enqueue(db, "triage", pid)
    db.commit()
    db.refresh(p)
    return p

def triage_patient(db: Session, patient_id: str, acuity: int, complaint: str) -> Patient:
    p = db.get(Patient, patient_id)
    if p is None:
        raise KeyError(f"Patient {patient_id} not found")
    p.acuity = acuity
    p.complaint = complaint
    p.journey = choose_journey(acuity, complaint)
    p.path = ["triage"] + [s for s in JOURNEYS[p.journey]["path"] if s != "triage"]
    # Mark triage done
    _dequeue(db, "triage", patient_id)
    p.cursor = 1
    nxt = p.path[p.cursor] if p.cursor < len(p.path) else None
    if nxt:
        _enqueue(db, nxt, patient_id, prepend=(acuity == 1))
    db.commit()
    db.refresh(p)
    return p

def advance_patient(db: Session, patient_id: str) -> Patient:
    p = db.get(Patient, patient_id)
    if p is None:
        raise KeyError(f"Patient {patient_id} not found")
    if p.cursor >= len(p.path):
        return p
    current = p.path[p.cursor]
    _dequeue(db, current, patient_id)
    p.cursor += 1
    if p.cursor < len(p.path):
        _enqueue(db, p.path[p.cursor], patient_id)
    db.commit()
    db.refresh(p)
    return p

# ---------- Queue helpers ----------
def _enqueue(db: Session, station: str, patient_id: str, prepend: bool = False) -> None:
    if prepend:
        # Bump everyone's position by 1, insert at 1
        db.execute(QueueEntry.__table__.update()
                   .where(QueueEntry.station == station)
                   .values(position=QueueEntry.position + 1))
        new_pos = 1
    else:
        max_pos = db.execute(select(func.max(QueueEntry.position))
                             .where(QueueEntry.station == station)).scalar() or 0
        new_pos = max_pos + 1
    db.add(QueueEntry(station=station, patient_id=patient_id, position=new_pos,
                      enqueued_at=datetime.utcnow()))
    db.flush()

def _dequeue(db: Session, station: str, patient_id: str) -> None:
    entry = db.execute(select(QueueEntry)
                       .where(QueueEntry.station == station,
                              QueueEntry.patient_id == patient_id)).scalar_one_or_none()
    if entry is None:
        return
    removed_pos = entry.position
    db.delete(entry)
    db.flush()
    # Compact remaining positions
    db.execute(QueueEntry.__table__.update()
               .where(QueueEntry.station == station,
                      QueueEntry.position > removed_pos)
               .values(position=QueueEntry.position - 1))

# ---------- Readers ----------
def list_station_queue(db: Session, station: str) -> list[dict]:
    rows = db.execute(
        select(QueueEntry, Patient)
        .join(Patient, Patient.id == QueueEntry.patient_id)
        .where(QueueEntry.station == station)
        .where(Patient.is_drift == False)
        .order_by(QueueEntry.position)
    ).all()
    now = datetime.utcnow()
    out = []
    for entry, p in rows:
        out.append({
            "position": entry.position, "id": p.id, "name": p.name, "phone": p.phone,
            "acuity": p.acuity if p.acuity is not None else "—",
            "complaint": p.complaint,
            "waitedMinutes": max(0, int((now - p.arrived_at).total_seconds() // 60)),
        })
    return out

def queue_count(db: Session, station: str) -> int:
    return db.execute(select(func.count(QueueEntry.id))
                       .where(QueueEntry.station == station)).scalar() or 0

def patient_position(db: Session, station: str, patient_id: str) -> int | None:
    entry = db.execute(select(QueueEntry).where(QueueEntry.station == station,
                                                 QueueEntry.patient_id == patient_id)).scalar_one_or_none()
    return entry.position if entry else None

def build_journey_response(db: Session, patient_id: str) -> dict:
    """Build the full journey object the frontend expects."""
    p = db.get(Patient, patient_id)
    if p is None:
        raise KeyError(f"Patient {patient_id} not found")

    from datetime import timedelta
    now = datetime.utcnow()
    cursor_time = now
    stages = []
    for i, station in enumerate(p.path):
        if i < p.cursor:
            stages.append({"station": station, "status": "done", "position": None,
                           "estStart": None, "estEnd": None, "waitP50": None, "waitP90": None})
        else:
            position = patient_position(db, station, patient_id)
            ahead = (position - 1) if position else queue_count(db, station)
            p50, p90 = predict_wait(station, ahead, SERVERS[station])
            stages.append({
                "station": station,
                "status": "current" if i == p.cursor else "upcoming",
                "position": position,
                "estStart": (cursor_time + timedelta(minutes=p50 // 2)).strftime("%H:%M"),
                "estEnd":   (cursor_time + timedelta(minutes=p90)).strftime("%H:%M"),
                "waitP50": p50, "waitP90": p90,
            })
            cursor_time += timedelta(minutes=p90)

    return {
        "patient": {
            "id": p.id, "name": p.name, "phone": p.phone,
            "acuity": p.acuity, "complaint": p.complaint,
            "journey": p.journey,
            "journeyLabel": JOURNEYS.get(p.journey, {}).get("label") if p.journey else None,
        },
        "stages": stages,
        "estimatedFinish": cursor_time.strftime("%H:%M") if stages else None,
    }
