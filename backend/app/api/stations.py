from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import QueueRow, CompleteRequest, JourneyResponse
from app.services import queue_service
from app.services.sms_service import send_sms, format_journey_sms
from app.ml.loader import STATIONS

router = APIRouter(prefix="", tags=["stations"])

@router.get("/queue/{station}", response_model=list[QueueRow])
def get_queue(station: str, db: Session = Depends(get_db)):
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    rows = queue_service.list_station_queue(db, station)
    return [QueueRow(**r) for r in rows]

@router.post("/station/{station}/complete", response_model=JourneyResponse)
def complete_station(station: str, req: CompleteRequest, db: Session = Depends(get_db)):
    if station not in STATIONS:
        raise HTTPException(status_code=400, detail=f"Unknown station: {station}")
    try:
        queue_service.advance_patient(db, req.patient_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Patient not found")
    journey = queue_service.build_journey_response(db, req.patient_id)
    if journey["stages"] and any(s["status"] == "current" for s in journey["stages"]):
        body = format_journey_sms(journey["patient"]["name"], journey["stages"],
                                  journey["estimatedFinish"])
        send_sms(db, req.patient_id, journey["patient"]["phone"], body)
    return journey
