from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import re

# ---------- Requests ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=5, max_length=120)

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        if not re.match(r"[^@]+@[^@]+\.[^@]+", v):
            raise ValueError('Invalid email format')
        return v.lower().strip()

    @field_validator('phone')
    @classmethod
    def validate_nigerian_phone(cls, v: str) -> str:
        # Remove spaces, dashes, and parentheses
        cleaned = re.sub(r'[\s\-()]', '', v)
        # Nigerian mobile numbers regex
        pattern = r'^(?:\+234|234|0)([789][01]\d{8})$'
        match = re.match(pattern, cleaned)
        if not match:
            raise ValueError('Invalid Nigerian phone number. Must be in the format +234XXXXXXXXXX or 0XXXXXXXXXX')
        
        # We can also normalize it right here so the DB only stores standard format
        return f"+234{match.group(1)}"


class TriageRequest(BaseModel):
    id: str
    acuity: int = Field(ge=1, le=3)
    complaint: str = Field(min_length=1, max_length=200)

class CompleteRequest(BaseModel):
    patient_id: str
    next_journey: Optional[str] = None

# ---------- Responses ----------
class RegisterResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    position: int

class PatientPublic(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    acuity: Optional[int] = None
    complaint: Optional[str] = None
    journey: Optional[str] = None
    journeyLabel: Optional[str] = None
    labStatus: Optional[str] = None

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
    email: str
    acuity: Optional[int | str] = "—"
    complaint: Optional[str] = None
    waitedMinutes: int
    calledAt: Optional[str] = None
    enteredAt: Optional[str] = None

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
    stationMae: Optional[dict] = None     # per-station MAE: {"triage": 1.2, "doctor": 18.5, ...}
    maeSource: str = "training"           # "training" (static CSV) or "live" (from prediction logs)
    maePredictionCount: int = 0           # number of completed predictions used

class Recommendation(BaseModel):
    level: str  # "critical" | "warning" | "ok"
    station: str
    title: str
    detail: str
    impact: str

class DailyStationLogSchema(BaseModel):
    date: str
    station: str
    total_patients: int
    avg_wait_minutes: float
    max_wait_minutes: float

class PredictiveInsight(BaseModel):
    station: str
    day_of_week: str
    expected_surge: str
    suggestion: str

class AnalyticsResponse(BaseModel):
    days: int
    logs: List[DailyStationLogSchema]
    insights: List[PredictiveInsight]

class RetrainStationStatus(BaseModel):
    station: str
    empirical_samples: int
    days_covered: int
    retrain_recommended: bool

class RetrainStatusResponse(BaseModel):
    stations: List[RetrainStationStatus]
    any_recommended: bool
