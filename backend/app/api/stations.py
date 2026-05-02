from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import QueueRow, CompleteRequest, JourneyResponse
from app.services import queue_service
from app.services.sms_service import send_sms, format_journey_sms, format_bumped_sms
from app.services.email_service import send_patient_email, format_journey_email, format_bumped_email
from app.ml.loader import STATIONS

router = APIRouter(prefix="", tags=["stations"])

@router.get("/queue/{station}", response_model=list[QueueRow])
def get_queue(station: str, db: Session = Depends(get_db)):
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    rows = queue_service.list_station_queue(db, station)
    return [QueueRow(**r) for r in rows]

@router.get("/queue/lab/pending", response_model=list[QueueRow])
def get_pending_lab(db: Session = Depends(get_db)):
    rows = queue_service.list_pending_lab_results(db)
    return [QueueRow(**r) for r in rows]

@router.post("/station/{station}/complete", response_model=JourneyResponse)
def complete_station(station: str, req: CompleteRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    try:
        p, bumped_ids, bump_reason, advanced_ids = queue_service.advance_patient(db, req.patient_id, req.next_journey)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
    journey = queue_service.build_journey_response(db, req.patient_id)
    has_current = any(s["status"] == "current" for s in journey["stages"])
    all_done = all(s["status"] == "done" for s in journey["stages"])
    
    if has_current or all_done:
        body = format_journey_sms(journey["patient"]["name"], journey["stages"],
                                  journey.get("estimatedFinish"), journey_type=journey["patient"]["journey"])
        background_tasks.add_task(send_sms, req.patient_id, journey["patient"]["phone"], body)
        
        email_subject, email_body = format_journey_email(journey["patient"]["name"], journey["stages"],
                                                         journey.get("estimatedFinish"), journey_type=journey["patient"]["journey"])
        background_tasks.add_task(send_patient_email, req.patient_id, journey["patient"]["email"], email_subject, email_body)
        
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
            a_sms = format_journey_sms(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_sms:
                background_tasks.add_task(send_sms, advanced_id, a_journey["patient"]["phone"], a_sms)
            
            a_subj, a_body = format_journey_email(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_body:
                background_tasks.add_task(send_patient_email, advanced_id, a_journey["patient"]["email"], a_subj, a_body)
            
    return journey

@router.post("/station/{station}/enter")
def enter_station(station: str, req: CompleteRequest, db: Session = Depends(get_db)):
    """Mark a patient as having entered the station room."""
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    try:
        queue_service.enter_patient(db, station, req.patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found in queue")
    return {"status": "entered", "patient_id": req.patient_id}

@router.post("/station/lab/collect")
def collect_sample(req: CompleteRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Mark a patient's sample as collected, moving them to pending_results."""
    try:
        p, advanced_ids = queue_service.collect_lab_sample(db, req.patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
        
    for advanced_id in advanced_ids:
        a_journey = queue_service.build_journey_response(db, advanced_id)
        if a_journey["stages"] and any(s["status"] == "current" for s in a_journey["stages"]):
            a_sms = format_journey_sms(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_sms:
                background_tasks.add_task(send_sms, advanced_id, a_journey["patient"]["phone"], a_sms)
            
            a_subj, a_body = format_journey_email(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_body:
                background_tasks.add_task(send_patient_email, advanced_id, a_journey["patient"]["email"], a_subj, a_body)
                
    return {"status": "sample_collected"}

@router.post("/station/{station}/skip")
def skip_patient(station: str, req: CompleteRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Skip a patient who did not present within the timeout window."""
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    try:
        p, advanced_ids = queue_service.skip_patient(db, station, req.patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Notify patients who moved up in the queue
    for advanced_id in advanced_ids:
        a_journey = queue_service.build_journey_response(db, advanced_id)
        if a_journey["stages"] and any(s["status"] == "current" for s in a_journey["stages"]):
            a_sms = format_journey_sms(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_sms:
                background_tasks.add_task(send_sms, advanced_id, a_journey["patient"]["phone"], a_sms)
            a_subj, a_body = format_journey_email(a_journey["patient"]["name"], a_journey["stages"], a_journey.get("estimatedFinish"), is_update=True)
            if a_body:
                background_tasks.add_task(send_patient_email, advanced_id, a_journey["patient"]["email"], a_subj, a_body)

    return {"status": "skipped", "patient_id": req.patient_id}
