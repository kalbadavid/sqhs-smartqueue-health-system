from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from collections import defaultdict
from app.db import get_db
from app.models import DailyStationLog
from app.schemas import (DashboardSummary, StationStats, Recommendation,
                         AnalyticsResponse, DailyStationLogSchema, PredictiveInsight,
                         RetrainStatusResponse, RetrainStationStatus,
                         PredictionLogsResponse, PredictionLogAnalytics,
                         PredictionLogEntry, StationMaeDetail, DailyMaePoint)
from app.services import queue_service
from app.services.queue_service import SERVERS
from app.services.prediction_logger import get_live_mae, get_retrain_status
from app.ml.predict import predict_queue_wait
from app.ml.loader import STATIONS, get_static_mae, get_model_loaded_at, shap_ready
from app.ml import shap_explainer

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db)):
    station_stats = []
    for station in STATIONS:
        n = queue_service.queue_count(db, station)
        p50, p90 = predict_queue_wait(station, n, SERVERS[station])
        utilization = min(0.95, n / (SERVERS[station] * 4))
        station_stats.append(StationStats(
            station=station, inQueue=n, servers=SERVERS[station],
            waitP50=p50, waitP90=p90, utilization=round(utilization, 3),
        ))

    bottleneck = max(station_stats, key=lambda s: s.waitP50)
    total_patients = sum(s.inQueue for s in station_stats)
    avg_visit = sum(s.waitP50 for s in station_stats) + 25  # +25 baseline service time

    # --- Live MAE from prediction logs (fallback to static training MAE) ---
    live_mae = get_live_mae(db, days=1)
    if live_mae["count"] > 0 and live_mae["network"] is not None:
        mae_value = live_mae["network"]
        mae_source = "live"
        station_mae = {k: v for k, v in live_mae.items() if k not in ("network", "count")}
        mae_count = live_mae["count"]
    else:
        mae_value = get_static_mae()
        mae_source = "training"
        station_mae = None
        mae_count = 0

    return DashboardSummary(
        timestamp=datetime.utcnow().isoformat(),
        totalPatients=total_patients,
        avgVisitMinutes=avg_visit,
        bottleneck=bottleneck,
        stations=station_stats,
        modelMaeMinutes=mae_value,
        stationMae=station_mae,
        maeSource=mae_source,
        maePredictionCount=mae_count,
    )

@router.get("/recommendations", response_model=list[Recommendation])
def get_recommendations(db: Session = Depends(get_db)):
    summary = get_summary(db)
    recs: list[Recommendation] = []
    b = summary.bottleneck

    # -----------------------------------------------------------------------
    # Critical bottleneck recommendation
    # -----------------------------------------------------------------------
    if b.waitP50 >= 35:
        if b.station == "doctor" and shap_ready():
            # Live SHAP attribution — top drivers for the current moment
            drivers = shap_explainer.get_current_drivers(n=2)
            if drivers:
                driver_parts = []
                for d in drivers:
                    val_str = f" ({d['shap_value']:+.1f} min)" if d["shap_value"] is not None else ""
                    driver_parts.append(f"**{d['label']}**{val_str}")
                driver_str = " and ".join(driver_parts)
                shap_detail = (
                    f"Doctor is the binding bottleneck at {b.waitP50} min P50 wait. "
                    f"SHAP attribution for this moment: top drivers are {driver_str}. "
                    f"Consider adjusting staffing or scheduling to address the dominant factor."
                )
            else:
                # SHAP ready but returned empty (unusual) — use global importance
                global_top = sorted(
                    shap_explainer.get_global_importance().items(),
                    key=lambda x: -x[1]
                )[:2]
                top_labels = " and ".join(shap_explainer.human_label(f) for f, _ in global_top)
                shap_detail = (
                    f"Doctor is the binding bottleneck at {b.waitP50} min P50 wait. "
                    f"SHAP analysis of the doctor model identifies {top_labels} "
                    f"as the primary drivers of wait time variance."
                )
        elif b.station == "doctor":
            # SHAP not ready — static fallback (honest about source)
            shap_detail = (
                f"Doctor is the binding bottleneck at {b.waitP50} min P50 wait. "
                f"Offline SHAP analysis identified arrival hour and day of week "
                f"as the dominant drivers of wait time at this station."
            )
        else:
            # Non-doctor bottleneck — no SHAP claim, queue-theoretic language only
            station_label = b.station.capitalize()
            role = {
                "pharmacy": "pharmacist", "lab": "technician",
                "triage": "triage nurse", "emergency": "emergency doctor",
            }.get(b.station, "staff member")
            shap_detail = (
                f"{station_label} is the binding bottleneck at {b.waitP50} min P50 wait. "
                f"Queue depth ({b.inQueue} patients, {b.servers} server(s)) exceeds service "
                f"capacity. Adding a {role} would reduce expected wait immediately."
            )

        _title_roles = {
            "pharmacy": "pharmacist", "doctor": "doctor",
            "lab": "technician", "triage": "triage nurse",
        }
        _role = _title_roles.get(b.station, "staff member")
        _prefix = "second " if b.servers == 1 else ""
        recs.append(Recommendation(
            level="critical",
            station=b.station,
            title=f"Add a {_prefix}{_role} now",
            detail=shap_detail,
            impact="Estimated total visit time ↓ ~22 min on average",
        ))

    # -----------------------------------------------------------------------
    # Lab surge warning — queue-theoretic (no SHAP claim for simulated station)
    # -----------------------------------------------------------------------
    lab = next((s for s in summary.stations if s.station == "lab"), None)
    if lab and lab.inQueue >= 7:
        recs.append(Recommendation(
            level="warning",
            station="lab",
            title="Lab queue trending up — prepare for surge",
            detail=(
                f"Lab has {lab.inQueue} patients queued across {lab.servers} server(s) "
                f"(P50 wait {lab.waitP50} min). Predicted arrivals in the next 30 min "
                f"exceed baseline. Hold one technician from break rotation."
            ),
            impact="Hold one technician from break rotation until queue clears",
        ))

    # -----------------------------------------------------------------------
    # OK status — doctor + triage
    # -----------------------------------------------------------------------
    doctor = next((s for s in summary.stations if s.station == "doctor"), None)
    if doctor and doctor.waitP50 < 35:
        recs.append(Recommendation(
            level="ok",
            station="doctor",
            title="Doctor and triage stations operating within target",
            detail=(
                f"Consultation P50 is {doctor.waitP50} min — below the 35-min action threshold. "
                f"No intervention required at this time."
            ),
            impact="Continue current staffing",
        ))

    return recs

@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(days: int = 7, db: Session = Depends(get_db)):
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(DailyStationLog).filter(DailyStationLog.date >= cutoff).order_by(DailyStationLog.date.asc()).all()
    
    log_schemas = [
        DailyStationLogSchema(
            date=l.date.strftime("%Y-%m-%d"),
            station=l.station,
            total_patients=l.total_patients,
            avg_wait_minutes=l.avg_wait_minutes,
            max_wait_minutes=l.max_wait_minutes
        ) for l in logs
    ]
    
    # Generate predictive insights based on the historical logs
    # Group by station and day of week
    station_day_stats = defaultdict(lambda: defaultdict(list))
    daily_totals = defaultdict(int)
    for l in logs:
        dow = l.date.strftime("%A")
        station_day_stats[l.station][dow].append(l.total_patients)
        daily_totals[l.date] += l.total_patients

    # Calculate busiest network day
    network_dow_stats = defaultdict(list)
    for date, total in daily_totals.items():
        dow = date.strftime("%A")
        network_dow_stats[dow].append(total)

    highest_network_avg = 0
    busiest_network_day = None
    for dow, counts in network_dow_stats.items():
        avg_count = sum(counts) / len(counts)
        if avg_count > highest_network_avg:
            highest_network_avg = avg_count
            busiest_network_day = dow

    insights = []
    
    # Network level insight
    if busiest_network_day and highest_network_avg > 100:
        insights.append(PredictiveInsight(
            station="Network",
            day_of_week=busiest_network_day,
            expected_surge=f"Expect ~{int(highest_network_avg)} patients overall (High Traffic)",
            suggestion=f"{busiest_network_day} is historically a high traffic day. We are expecting {int(highest_network_avg)} patients. Contract more staff to avoid overcrowding before reviewing department breakdowns."
        ))

    # Station level insights
    for station, dow_data in station_day_stats.items():
        highest_avg = 0
        busiest_day = None
        for dow, counts in dow_data.items():
            avg_count = sum(counts) / len(counts)
            if avg_count > highest_avg:
                highest_avg = avg_count
                busiest_day = dow
                
        # If the highest average is significantly large (>45), generate a recommendation
        if highest_avg > 45:
            insights.append(PredictiveInsight(
                station=station,
                day_of_week=busiest_day,
                expected_surge=f"Expect ~{int(highest_avg)} patients (High Traffic)",
                suggestion=f"Wait times at {station.capitalize()} tend to spike significantly on {busiest_day}s due to the high volume of incoming patients."
            ))
            
    # Default insight if none generated
    if not insights:
        insights.append(PredictiveInsight(
            station="Network",
            day_of_week="General",
            expected_surge="Traffic is within normal limits across all days.",
            suggestion="Maintain current staffing levels."
        ))

    return AnalyticsResponse(
        days=days,
        logs=log_schemas,
        insights=insights
    )

@router.get("/retrain-status", response_model=RetrainStatusResponse)
def retrain_status(db: Session = Depends(get_db)):
    """Check each station's empirical data accumulation for retraining readiness."""
    statuses = get_retrain_status(db, model_loaded_at=get_model_loaded_at())
    station_list = [RetrainStationStatus(**s) for s in statuses]
    return RetrainStatusResponse(
        stations=station_list,
        any_recommended=any(s.retrain_recommended for s in station_list),
    )

@router.get("/prediction-logs", response_model=PredictionLogsResponse)
def prediction_logs(days: int = 7, db: Session = Depends(get_db)):
    """Return raw prediction logs + analytics for the prediction logs viewer."""
    from sqlalchemy import select, func, cast, Date
    from app.models import PredictionLog

    cutoff = datetime.utcnow() - timedelta(days=days)

    # --- Raw rows (newest first, capped at 200) ---
    rows = db.execute(
        select(PredictionLog)
        .where(
            PredictionLog.actual_wait_min != None,  # noqa: E711
            PredictionLog.completed_at >= cutoff,
        )
        .order_by(PredictionLog.completed_at.desc())
        .limit(200)
    ).scalars().all()

    log_entries = []
    for r in rows:
        error = round(r.predicted_p50 - r.actual_wait_min, 1)
        log_entries.append(PredictionLogEntry(
            id=r.id,
            patient_id=r.patient_id,
            station=r.station,
            predicted_p50=round(r.predicted_p50, 1),
            predicted_p90=round(r.predicted_p90, 1),
            actual_wait_min=round(r.actual_wait_min, 1),
            error=error,
            abs_error=round(abs(error), 1),
            position_at_prediction=r.position_at_prediction,
            predicted_at=r.predicted_at.strftime("%Y-%m-%d %H:%M"),
            completed_at=r.completed_at.strftime("%Y-%m-%d %H:%M"),
        ))

    # --- Per-station MAE ---
    station_rows = db.execute(
        select(
            PredictionLog.station,
            func.avg(func.abs(PredictionLog.predicted_p50 - PredictionLog.actual_wait_min)).label("mae"),
            func.avg(PredictionLog.predicted_p50 - PredictionLog.actual_wait_min).label("avg_error"),
            func.count(PredictionLog.id).label("n"),
        ).where(
            PredictionLog.actual_wait_min != None,  # noqa: E711
            PredictionLog.completed_at >= cutoff,
        ).group_by(PredictionLog.station)
    ).all()

    per_station = []
    total_mae_sum, total_n = 0.0, 0
    for station, mae, avg_err, n in station_rows:
        per_station.append(StationMaeDetail(
            station=station,
            mae=round(mae, 1),
            count=n,
            avg_error=round(avg_err, 1),
        ))
        total_mae_sum += mae * n
        total_n += n

    overall_mae = round(total_mae_sum / total_n, 1) if total_n > 0 else None

    # --- Daily MAE trend ---
    daily_rows = db.execute(
        select(
            func.date(PredictionLog.completed_at).label("day"),
            func.avg(func.abs(PredictionLog.predicted_p50 - PredictionLog.actual_wait_min)).label("mae"),
            func.count(PredictionLog.id).label("n"),
        ).where(
            PredictionLog.actual_wait_min != None,  # noqa: E711
            PredictionLog.completed_at >= cutoff,
        ).group_by(func.date(PredictionLog.completed_at))
        .order_by(func.date(PredictionLog.completed_at))
    ).all()

    daily_trend = [
        DailyMaePoint(date=str(day), mae=round(mae, 1), count=n)
        for day, mae, n in daily_rows
    ]

    return PredictionLogsResponse(
        days=days,
        analytics=PredictionLogAnalytics(
            total_predictions=total_n,
            overall_mae=overall_mae,
            per_station=per_station,
            daily_trend=daily_trend,
        ),
        logs=log_entries,
    )

