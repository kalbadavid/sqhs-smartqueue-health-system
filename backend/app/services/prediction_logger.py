"""Prediction logging service — records predictions vs actuals for live MAE."""
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.models import PredictionLog


def log_prediction(db: Session, patient_id: str, station: str,
                   p50: int, p90: int, position: int) -> None:
    """Record a prediction when a patient is enqueued at a station.

    Only logs once per patient+station pair — skips if an open (uncompleted)
    prediction already exists for this combination.
    """
    existing = db.execute(
        select(PredictionLog).where(
            PredictionLog.patient_id == patient_id,
            PredictionLog.station == station,
            PredictionLog.actual_wait_min == None,  # noqa: E711 — SQLAlchemy IS NULL
        )
    ).scalar_one_or_none()

    if existing is not None:
        return  # Already logged for this enqueue — don't duplicate

    db.add(PredictionLog(
        patient_id=patient_id,
        station=station,
        predicted_p50=float(p50),
        predicted_p90=float(p90),
        position_at_prediction=position,
        predicted_at=datetime.utcnow(),
    ))
    db.flush()


def record_actual(db: Session, patient_id: str, station: str) -> None:
    """Stamp the actual wait time when a patient completes/leaves a station.

    Finds the most recent open prediction log for the patient+station pair
    and fills in actual_wait_min = (now - predicted_at) in minutes.
    """
    entry = db.execute(
        select(PredictionLog).where(
            PredictionLog.patient_id == patient_id,
            PredictionLog.station == station,
            PredictionLog.actual_wait_min == None,  # noqa: E711
        ).order_by(PredictionLog.predicted_at.desc())
    ).scalar_one_or_none()

    if entry is None:
        return  # No open prediction to close

    now = datetime.utcnow()
    elapsed = (now - entry.predicted_at).total_seconds() / 60.0
    entry.actual_wait_min = round(max(0, elapsed), 1)
    entry.completed_at = now
    db.flush()


def get_live_mae(db: Session, days: int = 1) -> dict:
    """Compute live MAE per station from completed prediction logs.

    Args:
        db: database session
        days: rolling window in days (default 1 = last 24h)

    Returns:
        dict like {"triage": 1.2, "doctor": 18.5, ..., "network": 12.1, "count": 42}
        Returns None values for stations with no completed predictions.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    rows = db.execute(
        select(
            PredictionLog.station,
            func.avg(func.abs(PredictionLog.predicted_p50 - PredictionLog.actual_wait_min)).label("mae"),
            func.count(PredictionLog.id).label("n"),
        ).where(
            PredictionLog.actual_wait_min != None,  # noqa: E711
            PredictionLog.completed_at >= cutoff,
        ).group_by(PredictionLog.station)
    ).all()

    result: dict = {}
    total_mae, total_n = 0.0, 0

    for station, mae, n in rows:
        result[station] = round(mae, 1) if mae is not None else None
        if mae is not None:
            total_mae += mae * n
            total_n += n

    result["network"] = round(total_mae / total_n, 1) if total_n > 0 else None
    result["count"] = total_n
    return result


def get_retrain_status(db: Session, model_loaded_at: datetime | None = None) -> list[dict]:
    """Check each station's empirical data accumulation for retraining readiness.

    Returns a list of dicts per station:
        station, empirical_samples, days_covered, retrain_recommended
    """
    from app.ml.loader import STATIONS

    out = []
    for station in STATIONS:
        stats = db.execute(
            select(
                func.count(PredictionLog.id).label("n"),
                func.min(PredictionLog.completed_at).label("earliest"),
                func.max(PredictionLog.completed_at).label("latest"),
            ).where(
                PredictionLog.station == station,
                PredictionLog.actual_wait_min != None,  # noqa: E711
            )
        ).one()

        n = stats.n or 0
        days_covered = 0
        if stats.earliest and stats.latest:
            days_covered = max(1, (stats.latest - stats.earliest).days)

        # Recommend retraining if:
        # 1. At least 30 days of data have accumulated, OR
        # 2. Model was loaded > 30 days ago and there is any empirical data
        retrain_recommended = False
        if days_covered >= 30 and n >= 50:
            retrain_recommended = True
        elif model_loaded_at:
            days_since_load = (datetime.utcnow() - model_loaded_at).days
            if days_since_load >= 30 and n >= 30:
                retrain_recommended = True

        out.append({
            "station": station,
            "empirical_samples": n,
            "days_covered": days_covered,
            "retrain_recommended": retrain_recommended,
        })

    return out
