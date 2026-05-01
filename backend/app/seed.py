"""Seed initial patient state matching the mock's seed exactly."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models import Patient, QueueEntry
from app.services import queue_service
from app.services.journey import JOURNEYS, choose_journey

SEED_PATIENTS = [
    ("Adaeze Okonkwo",   2, "persistent cough", 1),
    ("Ibrahim Lawal",    3, "blood test review", 1),
    ("Folake Adesina",   3, "prescription refill", 0),
    ("Tunde Bakare",     2, "malaria check", 1),
    ("Chioma Eze",       3, "general consult", 1),
    ("Aisha Yusuf",      2, "fever and headache", 2),
    ("Olumide Ade",      3, "urine test", 2),
    ("Grace Onuoha",     3, "BP follow-up", 0),
    ("Samuel Iroka",     3, "antibiotics", 0),
    ("Patience Obi",     3, "general consult", 1),
    ("Mariam Bello",     3, "sugar test", 2),
    ("Eze Kalu",         3, "prescription refill", 0),
    ("Ngozi Ekwueme",    3, "general consult", 1),
]
PHARMA_PAD = [
    "Yusuf Abubakar", "Hauwa Sani", "Daniel Okafor", "Bukola Aina",
    "Kelechi Nnamdi", "Halima Bashir", "Emeka Nwosu", "Ifeoma Anya",
]

def seed_database(db: Session) -> None:
    """Idempotent: if patients already exist, skip."""
    if db.query(Patient).count() > 0:
        return
    now = datetime.utcnow()
    for i, (name, acuity, complaint, station_idx) in enumerate(SEED_PATIENTS):
        journey = choose_journey(acuity, complaint)
        path = JOURNEYS[journey]["path"]
        pid = queue_service._new_id()
        while db.get(Patient, pid):
            pid = queue_service._new_id()
        p = Patient(
            id=pid, name=name, phone=f"+234 80{(i+3)%10} ••• {1000+i}",
            email=f"{name.split()[0].lower()}@example.com",
            acuity=acuity, complaint=complaint, journey=journey,
            path=path, cursor=station_idx,
            arrived_at=now - timedelta(minutes=(60 - i*4)),
        )
        db.add(p); db.flush()
        if station_idx < len(path):
            queue_service._enqueue(db, path[station_idx], pid)

    for i, name in enumerate(PHARMA_PAD):
        pid = queue_service._new_id()
        while db.get(Patient, pid):
            pid = queue_service._new_id()
        p = Patient(
            id=pid, name=name, phone=f"+234 81{i} ••• {2000+i}",
            email=f"{name.split()[0].lower()}@example.com",
            acuity=3, complaint="prescription refill", journey="D",
            path=["pharmacy"], cursor=0,
            arrived_at=now - timedelta(minutes=(40 - i*3)),
        )
        db.add(p); db.flush()
        queue_service._enqueue(db, "pharmacy", pid)
    db.commit()
