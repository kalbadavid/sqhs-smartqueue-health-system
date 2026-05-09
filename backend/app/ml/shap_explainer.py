"""SHAP explainer service for the doctor station.

SHAP is computed ONCE at model load time (Option B):
  - build_explainer() is called by loader.py after the doctor model is loaded
  - The resulting explainer + cached global importance are stored in memory
  - get_top_drivers() returns the current-moment top features using live time values

Only applied to the doctor model — the only empirical XGBoost station.
Simulated stations (triage, lab, pharmacy) are explicitly excluded.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

if TYPE_CHECKING:
    import shap as _shap_type

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Human-readable labels for raw feature names
# ---------------------------------------------------------------------------
_FEATURE_LABELS: dict[str, str] = {
    "Hour_of_Day":                 "arrival hour",
    "Day_of_Week":                 "day of week",
    "Month":                       "month of year",
    "Medication Revenue":          "medication revenue",
    "Lab Cost":                    "lab cost",
    "Consultation Revenue":        "consultation revenue",
    "Doctor Type_ANCHOR":          "anchor doctor assignment",
    "Doctor Type_FLOATING":        "floating doctor assignment",
    "Doctor Type_LOCUM":           "locum doctor mix",
    "Financial Class_CORPORATE":   "corporate patient mix",
    "Financial Class_HMO":         "HMO patient mix",
    "Financial Class_INSURANCE":   "insurance patient mix",
    "Financial Class_MEDICARE":    "Medicare patient mix",
    "Financial Class_PRIVATE":     "private patient mix",
}


def human_label(feature: str) -> str:
    """Convert a raw feature name to a readable string."""
    return _FEATURE_LABELS.get(feature, feature.replace("_", " ").lower())


# ---------------------------------------------------------------------------
# Module-level cache (populated once at startup)
# ---------------------------------------------------------------------------
_explainer: object | None = None          # shap.TreeExplainer instance
_global_importance: dict[str, float] = {} # mean |SHAP| over reference grid
_feature_names: list[str] = []


def build_explainer(model: object, feature_names: list[str]) -> None:
    """Build and cache the SHAP TreeExplainer for the doctor P50 model.

    Called once by loader.py at server startup — NOT per request.
    Uses a synthetic reference grid (hour 0-23 × weekday 0-6) to compute
    global mean |SHAP| values. Revenue/billing features are held at 0
    (consistent with runtime prediction behaviour).
    """
    global _explainer, _global_importance, _feature_names

    try:
        import shap
    except ImportError:
        log.warning("SHAP not installed — SHAP-driven recommendations disabled. "
                    "Run: pip install shap")
        return

    log.info("Building SHAP TreeExplainer for doctor station (%d features)…",
             len(feature_names))

    _feature_names = feature_names

    try:
        _explainer = shap.TreeExplainer(model)

        # Build a reference grid: all 168 hour×weekday combinations, month=6 (mid-year)
        rows = []
        for h in range(24):
            for d in range(7):
                row = {f: 0.0 for f in feature_names}
                row["Hour_of_Day"] = h
                row["Day_of_Week"] = d
                row["Month"] = 6
                rows.append(row)

        grid = pd.DataFrame(rows, columns=feature_names)
        shap_grid = _explainer.shap_values(grid)   # shape (168, n_features)

        # Global importance = mean absolute SHAP across the grid
        mean_abs = np.abs(shap_grid).mean(axis=0)
        _global_importance = {
            feat: round(float(val), 3)
            for feat, val in zip(feature_names, mean_abs)
        }

        top = sorted(_global_importance.items(), key=lambda x: -x[1])[:3]
        top_str = ", ".join(f"{human_label(f)} ({v:.2f})" for f, v in top)
        log.info("SHAP ready. Global top drivers: %s", top_str)

    except Exception as exc:
        log.error("SHAP explainer build failed: %s — falling back to static text", exc)
        _explainer = None


def is_ready() -> bool:
    """Return True if the SHAP explainer was successfully built."""
    return _explainer is not None and bool(_global_importance)


def get_global_importance() -> dict[str, float]:
    """Return pre-computed global mean |SHAP| values (feature → contribution in minutes)."""
    return dict(_global_importance)


def get_current_drivers(hour: int | None = None,
                        dow: int | None = None,
                        month: int | None = None,
                        n: int = 3) -> list[dict]:
    """Compute SHAP for the current time's feature vector.

    Returns a ranked list of dicts:
        [{"feature": "Hour_of_Day", "label": "arrival hour", "shap_value": 8.3}, ...]

    Falls back to global importance if explainer not ready.
    """
    if not is_ready():
        # Degrade gracefully: return global importance rankings with None values
        ranked = sorted(_global_importance.items(), key=lambda x: -x[1])[:n]
        return [{"feature": f, "label": human_label(f), "shap_value": None}
                for f, _ in ranked]

    now = datetime.now()
    h = hour if hour is not None else now.hour
    d = dow if dow is not None else now.weekday()
    m = month if month is not None else now.month

    row = {f: 0.0 for f in _feature_names}
    row["Hour_of_Day"] = h
    row["Day_of_Week"] = d
    row["Month"] = m

    X = pd.DataFrame([row], columns=_feature_names)

    try:
        shap_vals = _explainer.shap_values(X)[0]  # shape (n_features,)
        ranked = sorted(
            zip(_feature_names, shap_vals),
            key=lambda x: -abs(x[1])
        )[:n]
        return [
            {
                "feature": feat,
                "label": human_label(feat),
                "shap_value": round(float(val), 2),
            }
            for feat, val in ranked
            if abs(val) > 0.01   # skip near-zero contributors
        ]
    except Exception as exc:
        log.warning("SHAP current-drivers computation failed: %s", exc)
        return []
