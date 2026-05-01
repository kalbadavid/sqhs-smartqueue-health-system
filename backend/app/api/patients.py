from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import (RegisterRequest, RegisterResponse, TriageRequest, JourneyResponse)
from app.services import queue_service
from app.services.sms_service import send_sms, format_journey_sms, format_bumped_sms
from app.services.email_service import send_patient_email, format_journey_email, format_bumped_email

router = APIRouter(prefix="", tags=["patients"])

@router.post("/patients", response_model=RegisterResponse)
def register(req: RegisterRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    print(f"DEBUG: Entering register endpoint for {req.name}")
    p = queue_service.register_patient(db, req.name, req.phone, req.email)
    position = queue_service.patient_position(db, "triage", p.id) or 0
    journey = queue_service.build_journey_response(db, p.id)
    triage_stage = journey["stages"][0]
    p50, p90 = triage_stage["waitP50"], triage_stage["waitP90"]
    
    # Welcome SMS and Email
    if p50 == 0:
        body = (f"Hello {p.name.split()[0]}, you are checked in. "
                f"Your triage position is #{position}. "
                f"You are NEXT in line. Please proceed to the Triage station immediately.")
        
        email_body = (f"<p>Hello {p.name.split()[0]}, you are checked in.</p>"
                      f"<p>Your triage position is <strong>#{position}</strong>.</p>"
                      f"<p>You are <strong>NEXT</strong> in line. Please proceed to the Triage station <strong>immediately</strong>.</p>")
    else:
        body = (f"Hello {p.name.split()[0]}, you are checked in. "
                f"Your triage position is #{position}. "
                f"Estimated wait time: {p50}-{p90} minutes. "
                f"We'll text you again when triage is ready.")
        
        email_body = (f"<p>Hello {p.name.split()[0]}, you are checked in.</p>"
                      f"<p>Your triage position is <strong>#{position}</strong>.</p>"
                      f"<p>Estimated wait time: <strong>{p50}-{p90} minutes</strong>.</p>"
                      f"<p>We'll notify you when triage is ready.</p>")
                      
    subject = "Welcome to SQHS"
    background_tasks.add_task(send_sms, p.id, p.phone, body)
    background_tasks.add_task(send_patient_email, p.id, p.email, subject, email_body)
    return RegisterResponse(id=p.id, name=p.name, phone=p.phone, email=p.email, position=position)

@router.post("/journey", response_model=JourneyResponse)
def assign_journey(req: TriageRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        p, bumped_ids, bump_reason, advanced_ids = queue_service.triage_patient(db, req.id, req.acuity, req.complaint)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
    journey = queue_service.build_journey_response(db, req.id)
    body = format_journey_sms(journey["patient"]["name"], journey["stages"],
                              journey["estimatedFinish"], journey_type=journey["patient"]["journey"])
    background_tasks.add_task(send_sms, req.id, journey["patient"]["phone"], body)
    
    email_subject, email_body = format_journey_email(journey["patient"]["name"], journey["stages"],
                                                     journey["estimatedFinish"], journey_type=journey["patient"]["journey"])
    background_tasks.add_task(send_patient_email, req.id, journey["patient"]["email"], email_subject, email_body)
    
    for bumped_id in bumped_ids:
        b_journey = queue_service.build_journey_response(db, bumped_id)
        if b_journey["stages"] and any(s["status"] == "current" for s in b_journey["stages"]):
            b_sms = format_bumped_sms(b_journey["patient"]["name"], b_journey["stages"], bump_reason)
            background_tasks.add_task(send_sms, bumped_id, b_journey["patient"]["phone"], b_sms)
            
            b_subj, b_body = format_bumped_email(b_journey["patient"]["name"], b_journey["stages"], bump_reason)
            background_tasks.add_task(send_patient_email, bumped_id, b_journey["patient"]["email"], b_subj, b_body)
            
    for advanced_id in advanced_ids:
        a_journey = queue_service.build_journey_response(db, advanced_id)
        if a_journey["stages"] and any(s["status"] == "current" for s in a_journey["stages"]):
            a_sms = format_journey_sms(a_journey["patient"]["name"], a_journey["stages"], a_journey["estimatedFinish"], is_update=True)
            if a_sms:
                background_tasks.add_task(send_sms, advanced_id, a_journey["patient"]["phone"], a_sms)
            
            a_subj, a_body = format_journey_email(a_journey["patient"]["name"], a_journey["stages"], a_journey["estimatedFinish"], is_update=True)
            if a_body:
                background_tasks.add_task(send_patient_email, advanced_id, a_journey["patient"]["email"], a_subj, a_body)
            
    return journey

@router.get("/patients/{patient_id}/journey", response_model=JourneyResponse)
def get_journey(patient_id: str, db: Session = Depends(get_db)):
    try:
        return queue_service.build_journey_response(db, patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
