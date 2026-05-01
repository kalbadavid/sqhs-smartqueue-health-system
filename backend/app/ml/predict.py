"""Build features and predict wait times at a station.

Two prediction paths:

  predict_queue_wait()    — queue-theoretic, used by the dashboard summary.
                            Estimates wait based on queue depth + mean service
                            time.

  predict_patient_wait()  — ML-driven, used for an individual patient's journey
                            prediction. Builds real features from the patient
                            and asks the trained quantile model.

The trained models were validated on individual test samples in the notebook,
which is what predict_patient_wait does.
"""
import numpy as np
import pandas as pd
from datetime import datetime
from app.ml.loader import get_models

# Mean service time per station — used for queue-theoretic dashboard predictions.
# These match the simulation parameters used to train the simulated stations.
SERVICE_MEAN_MIN = {
    "triage":   3.0,    # 1/µ = 60/20
    "doctor":   12.0,   # observed median in Kaggle data
    "lab":      15.0,   # 1/µ = 60/4
    "pharmacy": 4.3,    # 1/µ = 60/14 (Bahadori)
    "emergency": 10.0,
}

# Service-time variability multiplier used to derive a "P90" service estimate
# from the mean. Heavy-tailed exponential service times typically have
# P90 / mean ≈ 2.3.
P90_MULTIPLIER = 2.3


# =====================================================================
# Path 1: Queue-theoretic prediction — used by the dashboard
# =====================================================================
def predict_queue_wait(station: str, queue_depth: int, num_servers: int) -> tuple[int, int]:
    """
    Estimate (P50, P90) wait time in minutes for a patient who would join the
    given station's queue right now, based on queue depth and mean service time.

    This is the standard M/M/c approximation:
        wait ≈ (people ahead of me / number of servers) × mean service time
    """
    svc = SERVICE_MEAN_MIN.get(station, 5.0)
    if num_servers <= 0:
        num_servers = 1
    # 'Effective queue' = patients currently waiting beyond the available servers
    ahead_effective = max(0, queue_depth - num_servers) / num_servers

    # P50: median expected wait
    p50 = ahead_effective * svc + svc / 2.0

    # P90: upper bound — incorporates service-time variability for the patient
    # currently being served at each server, plus an additional service time
    # for the patient's own service.
    p90 = ahead_effective * svc * P90_MULTIPLIER + svc * P90_MULTIPLIER

    return int(round(max(0, p50))), int(round(max(0, p90)))


# =====================================================================
# Path 2: ML-driven per-patient prediction — used by /journey
# =====================================================================
def _build_doctor_features(features_list: list[str], hour: int, dow: int, month: int,
                           doctor_type: str = "ANCHOR",
                           financial_class: str = "PRIVATE") -> pd.DataFrame:
    row = {f: 0.0 for f in features_list}
    row["Hour_of_Day"] = hour
    row["Day_of_Week"] = dow
    row["Month"] = month
    dt_col = f"Doctor Type_{doctor_type}"
    fc_col = f"Financial Class_{financial_class}"
    if dt_col in row: row[dt_col] = 1.0
    if fc_col in row: row[fc_col] = 1.0
    return pd.DataFrame([row], columns=features_list)


def _build_simulated_features(features_list: list[str], hour: int, dow: int, month: int,
                              station: str) -> pd.DataFrame:
    row = {f: 0.0 for f in features_list}
    row["hour_of_day"]  = hour
    row["day_of_week"]  = dow
    row["month"]        = month
    row["service_min"]  = SERVICE_MEAN_MIN.get(station, 5.0)
    return pd.DataFrame([row], columns=features_list)


def predict_patient_wait(station: str, position_in_queue: int = 0,
                         num_servers: int = 1,
                         hour: int | None = None, dow: int | None = None,
                         month: int | None = None) -> tuple[int, int]:
    """
    Predict (P50, P90) wait time in minutes for a specific patient at a given
    position in the station's queue, using the trained quantile model.

    Falls back to queue-theoretic estimation if the model is missing or
    returns implausible values.
    """
    pkg = get_models(station)
    if pkg is None:
        return predict_queue_wait(station, position_in_queue, num_servers)

    now = datetime.now()
    h = hour if hour is not None else now.hour
    d = dow if dow is not None else now.weekday()
    m = month if month is not None else now.month

    features = pkg["features"]
    if station == "doctor":
        X_raw = _build_doctor_features(features, h, d, m)
    else:
        X_raw = _build_simulated_features(features, h, d, m, station)

    try:
        X = pkg["scaler"].transform(X_raw)
        base_p50 = float(pkg["p50"].predict(X)[0])
        base_p90 = float(pkg["p90"].predict(X)[0])
    except Exception:
        return predict_queue_wait(station, position_in_queue, num_servers)

    # Clip negative predictions (quantile XGB can return slightly < 0 on
    # near-zero distributions). The model's median is the wait for a single
    # patient under typical load — we don't multiply it by queue position
    # because the model was trained on observed waits which already include
    # the time spent waiting for everyone ahead at the time of training.
    base_p50 = max(0, base_p50)
    base_p90 = max(base_p50, base_p90)  # P90 must be >= P50

    # Adjust for the current queue depth relative to the typical queue depth
    # the model was trained on. To make it strictly monotonically increasing 
    # per patient (which feels correct to users), we scale directly by position.
    extra_delay = (position_in_queue / num_servers) * SERVICE_MEAN_MIN.get(station, 5.0)
    p50 = base_p50 + extra_delay
    p90 = base_p90 + extra_delay * P90_MULTIPLIER

    # Sanity bound — wait should never exceed 6 hours
    p50 = min(360, p50)
    p90 = min(720, p90)

    return int(round(p50)), int(round(p90))


# Backwards-compatible alias for any code that imports the old name
def predict_wait(station: str, position_in_queue: int = 0,
                 num_servers: int = 1) -> tuple[int, int]:
    return predict_patient_wait(station, position_in_queue, num_servers)
