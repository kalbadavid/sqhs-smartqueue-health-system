"""Load station-specific model artifacts from disk at startup."""
import csv
import os
import joblib
import logging
from app.config import settings

log = logging.getLogger(__name__)

STATIONS = ["triage", "doctor", "lab", "pharmacy", "emergency"]

# In-memory cache of loaded artifacts: { "doctor": {"point": ..., "p50": ..., ...} }
_models: dict[str, dict] = {}

# Average MAE across all station models (read from training-notebook CSVs)
_avg_mae: float | None = None

def load_all_models() -> None:
    global _models
    base = os.path.abspath(settings.model_dir)
    log.info(f"Loading models from {base}")
    for station in STATIONS:
        sdir = os.path.join(base, station)
        if not os.path.isdir(sdir):
            log.warning(f"Missing model dir for {station} (expected if new station) — skipping")
            continue
        try:
            _models[station] = {
                "point":    joblib.load(os.path.join(sdir, "point_model.pkl")),
                "p50":      joblib.load(os.path.join(sdir, "p50_model.pkl")),
                "p90":      joblib.load(os.path.join(sdir, "p90_model.pkl")),
                "scaler":   joblib.load(os.path.join(sdir, "scaler.pkl")),
                "features": joblib.load(os.path.join(sdir, "features.pkl")),
            }
            log.info(f"  ✓ {station}: {len(_models[station]['features'])} features")
        except Exception as e:
            log.error(f"  ✗ {station}: failed to load — {e}")

    _load_mae_metrics(base)

def _load_mae_metrics(base: str) -> None:
    """Read MAE from each station's *_model_comparison.csv and average them."""
    global _avg_mae
    mae_values: list[float] = []

    # Mapping: CSV file name prefix → how the P50 row is labelled
    csv_files = {
        "doctor_model_comparison.csv": "P50",
        "lab_model_comparison.csv": "P50",
        "pharmacy_model_comparison.csv": "P50",
        "triage_model_comparison.csv": "P50",
    }

    for filename in csv_files:
        path = os.path.join(base, filename)
        if not os.path.isfile(path):
            log.warning(f"Metrics file not found: {path}")
            continue
        try:
            with open(path, newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Match the XGBoost P50 row (contains "P50" in the Model name)
                    if "P50" in row.get("Model", ""):
                        mae_values.append(float(row["MAE"]))
                        break
        except Exception as e:
            log.warning(f"Could not read MAE from {filename}: {e}")

    if mae_values:
        _avg_mae = round(sum(mae_values) / len(mae_values), 1)
        log.info(f"  📊 Average model MAE (from {len(mae_values)} stations): {_avg_mae} min")
    else:
        log.warning("No MAE metrics found — dashboard will use fallback value")

def get_avg_mae() -> float:
    """Return average MAE across station models, or 8.4 as fallback."""
    return _avg_mae if _avg_mae is not None else 8.4

def get_models(station: str) -> dict | None:
    return _models.get(station)

def models_loaded() -> dict[str, bool]:
    return {s: s in _models for s in STATIONS}
