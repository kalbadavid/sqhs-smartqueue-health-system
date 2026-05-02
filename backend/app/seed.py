"""Seed initial patient state matching the mock's seed exactly."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models import Patient, QueueEntry, DailyStationLog
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
    now = datetime.utcnow()
    
    # Seed Patients if none exist
    if db.query(Patient).count() == 0:
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
    # Seed DailyStationLog data for the past 14 days
    if db.query(DailyStationLog).count() == 0:
        import random
        stations = ["triage", "doctor", "lab", "pharmacy", "emergency"]
        for d in range(14, 0, -1):
            log_date = now - timedelta(days=d)
            # Make Mondays (weekday 0) and Fridays (weekday 4) slightly busier
            is_busy_day = log_date.weekday() in [0, 4]
            
            for st in stations:
                if is_busy_day:
                    base_patients = random.randint(100, 150)
                else:
                    base_patients = random.randint(20, 40)
                
                base_wait = random.uniform(5.0, 25.0)
                if is_busy_day and st in ["pharmacy", "triage"]:
                    base_wait += random.uniform(15.0, 30.0) # Simulate bottleneck
                
                max_w = base_wait + random.uniform(10.0, 40.0)
                
                dlog = DailyStationLog(
                    date=log_date.replace(hour=0, minute=0, second=0, microsecond=0),
                    station=st,
                    total_patients=base_patients,
                    avg_wait_minutes=round(base_wait, 1),
                    max_wait_minutes=round(max_w, 1)
                )
                db.add(dlog)
    
    db.commit()
