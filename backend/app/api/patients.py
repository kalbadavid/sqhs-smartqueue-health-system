from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import (RegisterRequest, RegisterResponse, TriageRequest, JourneyResponse)
from app.services import queue_service
from app.services.sms_service import send_sms, format_journey_sms

router = APIRouter(prefix="", tags=["patients"])

@router.post("/patients", response_model=RegisterResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    p = queue_service.register_patient(db, req.name, req.phone)
    position = queue_service.patient_position(db, "triage", p.id) or 0
    # Welcome SMS
    body = (f"Hello {p.name.split()[0]}, you are checked in. "
            f"Your triage position is #{position}. "
            f"We'll text you again when triage is ready.")
    send_sms(db, p.id, p.phone, body)
    return RegisterResponse(id=p.id, name=p.name, phone=p.phone, position=position)

@router.post("/journey", response_model=JourneyResponse)
def assign_journey(req: TriageRequest, db: Session = Depends(get_db)):
    try:
        queue_service.triage_patient(db, req.id, req.acuity, req.complaint)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
    journey = queue_service.build_journey_response(db, req.id)
    body = format_journey_sms(journey["patient"]["name"], journey["stages"],
                              journey["estimatedFinish"])
    send_sms(db, req.id, journey["patient"]["phone"], body)
    return journey

@router.get("/patients/{patient_id}/journey", response_model=JourneyResponse)
def get_journey(patient_id: str, db: Session = Depends(get_db)):
    try:
        return queue_service.build_journey_response(db, patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
