from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

# ---------- Requests ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)

class TriageRequest(BaseModel):
    id: str
    acuity: int = Field(ge=1, le=3)
    complaint: str = Field(min_length=1, max_length=200)

class CompleteRequest(BaseModel):
    patient_id: str

# ---------- Responses ----------
class RegisterResponse(BaseModel):
    id: str
    name: str
    phone: str
    position: int

class PatientPublic(BaseModel):
    id: str
    name: str
    phone: str
    acuity: Optional[int] = None
    complaint: Optional[str] = None
    journey: Optional[str] = None
    journeyLabel: Optional[str] = None

class JourneyStage(BaseModel):
    station: str
    status: str  # "done" | "current" | "upcoming"
    position: Optional[int] = None
    estStart: Optional[str] = None
    estEnd: Optional[str] = None
    waitP50: Optional[int] = None
    waitP90: Optional[int] = None

class JourneyResponse(BaseModel):
    patient: PatientPublic
    stages: List[JourneyStage]
    estimatedFinish: Optional[str] = None

class QueueRow(BaseModel):
    position: int
    id: str
    name: str
    phone: str
    acuity: Optional[int | str] = "—"
    complaint: Optional[str] = None
    waitedMinutes: int

class StationStats(BaseModel):
    station: str
    inQueue: int
    servers: int
    waitP50: int
    waitP90: int
    utilization: float

class DashboardSummary(BaseModel):
    timestamp: str
    totalPatients: int
    avgVisitMinutes: int
    bottleneck: StationStats
    stations: List[StationStats]
    modelMaeMinutes: float

class Recommendation(BaseModel):
    level: str  # "critical" | "warning" | "ok"
    station: str
    title: str
    detail: str
    impact: str
