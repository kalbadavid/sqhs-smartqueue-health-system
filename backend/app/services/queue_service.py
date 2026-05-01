"""All queue manipulation goes through here."""
import secrets
import string
from datetime import datetime, timezone, timedelta as tdelta
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session
from app.models import Patient, QueueEntry
from app.services.journey import JOURNEYS, choose_journey
from app.ml.predict import predict_wait
from app.ml.loader import STATIONS

ALPHA = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
SERVERS = {"triage": 2, "doctor": 3, "lab": 2, "pharmacy": 2, "emergency": 2}

def _new_id(n: int = 6) -> str:
    return "".join(secrets.choice(ALPHA) for _ in range(n))

# ---------- Mutators ----------
def register_patient(db: Session, name: str, phone: str, email: str) -> Patient:
    print("DEBUG: register_patient - generating id")
    pid = _new_id()
    while db.get(Patient, pid):  # collision safety
        pid = _new_id()
    print(f"DEBUG: register_patient - id generated: {pid}")
    p = Patient(id=pid, name=name, phone=phone, email=email, path=["triage"], cursor=0,
                arrived_at=datetime.utcnow())
    print("DEBUG: register_patient - adding patient to session")
    db.add(p)
    print("DEBUG: register_patient - flushing db")
    db.flush()
    print("DEBUG: register_patient - enqueueing patient")
    _enqueue(db, "triage", pid)
    print("DEBUG: register_patient - committing db")
    db.commit()
    db.refresh(p)
    return p

def triage_patient(db: Session, patient_id: str, acuity: int, complaint: str) -> tuple[Patient, list[str], str, list[str]]:
    p = db.get(Patient, patient_id)
    if p is None:
        raise KeyError(f"Patient {patient_id} not found")
    p.acuity = acuity
    p.complaint = complaint
    if acuity == 1:
        p.journey = "Z"
        p.path = ["triage", "emergency"]
    else:
        p.journey = choose_journey(acuity, complaint)
        p.path = ["triage"] + [s for s in JOURNEYS[p.journey]["path"] if s != "triage"]
    # Mark triage done
    advanced_ids = _dequeue(db, "triage", patient_id)
    p.cursor = 1
    nxt = p.path[p.cursor] if p.cursor < len(p.path) else None
    bumped_ids = []
    bump_reason = None
    if nxt:
        bumped_ids = _enqueue(db, nxt, patient_id, priority=acuity)
        if bumped_ids:
            bump_reason = "emergency" if acuity == 1 else "urgent"
    db.commit()
    db.refresh(p)
    return p, bumped_ids, bump_reason, advanced_ids

def advance_patient(db: Session, patient_id: str, next_journey: str = None) -> tuple[Patient, list[str], str, list[str]]:
    p = db.get(Patient, patient_id)
    if p is None:
        raise KeyError(f"Patient {patient_id} not found")
    if p.cursor >= len(p.path):
        return p, [], None, []
    current = p.path[p.cursor]
    advanced_ids = _dequeue(db, current, patient_id)
    
    if next_journey:
        if next_journey == "DONE":
            p.path = p.path[:p.cursor + 1]
        elif next_journey in JOURNEYS:
            p.journey = next_journey
            if next_journey == "A":
                suffix = ["pharmacy"]
            elif next_journey == "B":
                suffix = ["lab", "doctor", "pharmacy"]
            elif next_journey == "E":
                suffix = ["lab"]
            elif next_journey == "F":
                suffix = ["lab", "pharmacy"]
            else:
                suffix = []
            p.path = p.path[:p.cursor + 1] + suffix

    bumped_ids = []
    p.cursor += 1
    if p.cursor < len(p.path):
        next_station = p.path[p.cursor]
        is_returning = next_station in p.path[:p.cursor]
        
        bumped_ids = []
        bump_reason = None
        if is_returning:
            bumped_ids = _enqueue(db, next_station, patient_id, priority=1)
            bump_reason = "returning"
        else:
            # Check the patient's acuity to determine priority
            bumped_ids = _enqueue(db, next_station, patient_id, priority=(p.acuity or 3))
            if bumped_ids:
                bump_reason = "emergency" if p.acuity == 1 else "urgent"
    else:
        bump_reason = None
    db.commit()
    db.refresh(p)
    return p, bumped_ids, bump_reason, advanced_ids

# ---------- Queue helpers ----------
def _enqueue(db: Session, station: str, patient_id: str, priority: int = 3) -> list[str]:
    # priority 1 = highest, priority 3 = lowest. Returning patients get priority 1.
    s = SERVERS.get(station, 1)
    
    # Get everyone currently at the station, sorted by position
    entries = db.execute(
        select(QueueEntry, Patient.acuity)
        .join(Patient, Patient.id == QueueEntry.patient_id)
        .where(QueueEntry.station == station)
        .order_by(QueueEntry.position)
    ).all()
    
    max_pos = len(entries)
    new_pos = max_pos + 1
    
    # Find insertion point starting after active servers
    for i in range(s, max_pos):
        entry, acuity = entries[i]
        # entry_priority defaults to 3 if not set
        entry_priority = acuity or 3
        # If the new patient has a STRICTLY HIGHER priority (lower number) than the patient at this position
        if priority < entry_priority:
            new_pos = i + 1  # 1-indexed
            break
            
    bumped_ids = []
    if new_pos <= max_pos:
        db.execute(QueueEntry.__table__.update()
                   .where(QueueEntry.station == station)
                   .where(QueueEntry.position >= new_pos)
                   .values(position=QueueEntry.position + 1))
        # collect the bumped patients
        for i in range(new_pos - 1, max_pos):
            bumped_ids.append(entries[i][0].patient_id)
                   
    db.add(QueueEntry(station=station, patient_id=patient_id, position=new_pos,
                      enqueued_at=datetime.utcnow()))
    db.flush()
    return bumped_ids

def _dequeue(db: Session, station: str, patient_id: str) -> list[str]:
    entry = db.execute(select(QueueEntry)
                       .where(QueueEntry.station == station,
                              QueueEntry.patient_id == patient_id)).scalar_one_or_none()
    if entry is None:
        return []
    removed_pos = entry.position
    db.delete(entry)
    db.flush()
    
    # Get patients who will be advanced
    advanced_entries = db.execute(select(QueueEntry)
                                  .where(QueueEntry.station == station,
                                         QueueEntry.position > removed_pos)).scalars().all()
    advanced_ids = [e.patient_id for e in advanced_entries]
    
    # Compact remaining positions
    if advanced_ids:
        db.execute(QueueEntry.__table__.update()
                   .where(QueueEntry.station == station,
                          QueueEntry.position > removed_pos)
                   .values(position=QueueEntry.position - 1))
        db.flush()
        
    return advanced_ids

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
            "position": entry.position, "id": p.id, "name": p.name, "phone": p.phone, "email": p.email,
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

    # Use West Africa Time (WAT = UTC+1) so estimated times match patient's local clock
    WAT = timezone(tdelta(hours=1))
    now = datetime.now(WAT).replace(tzinfo=None)
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
            
            # If the patient's position is within the number of active servers, they should enter immediately
            if position and position <= SERVERS[station] and i == p.cursor:
                p50, p90 = 0, 0
                
            stages.append({
                "station": station,
                "status": "current" if i == p.cursor else "upcoming",
                "position": position,
                "estStart": (cursor_time + tdelta(minutes=p50)).strftime("%H:%M"),
                "estEnd":   (cursor_time + tdelta(minutes=p90)).strftime("%H:%M"),
                "waitP50": p50, "waitP90": p90,
            })
            cursor_time += tdelta(minutes=p90)

    return {
        "patient": {
            "id": p.id, "name": p.name, "phone": p.phone, "email": p.email,
            "acuity": p.acuity, "complaint": p.complaint,
            "journey": p.journey,
            "journeyLabel": JOURNEYS.get(p.journey, {}).get("label") if p.journey else None,
        },
        "stages": stages,
        "estimatedFinish": cursor_time.strftime("%H:%M") if stages else None,
    }
