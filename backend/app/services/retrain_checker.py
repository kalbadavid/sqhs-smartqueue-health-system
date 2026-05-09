"""Background task that periodically checks if models need retraining.

Runs as an async loop inside FastAPI's startup lifecycle.
Does NOT retrain automatically — it only sets a flag that the dashboard reads.
"""
import asyncio
import logging
from datetime import datetime
from app.db import SessionLocal
from app.services.prediction_logger import get_retrain_status
from app.ml.loader import get_model_loaded_at

log = logging.getLogger(__name__)

# In-memory cache of last check result (read by dashboard without DB hit)
_last_check: dict | None = None
_last_checked_at: datetime | None = None


def get_cached_retrain_status() -> dict | None:
    """Return the most recent retrain check result (cached in memory)."""
    return _last_check


async def retrain_check_loop(interval_hours: int = 24) -> None:
    """Run the retrain check every `interval_hours` hours.

    On first run, waits 60 seconds to let the app fully initialise.
    """
    global _last_check, _last_checked_at

    await asyncio.sleep(60)  # Let startup complete
    log.info("Retrain checker: started (checking every %dh)", interval_hours)

    while True:
        try:
            with SessionLocal() as db:
                statuses = get_retrain_status(db, model_loaded_at=get_model_loaded_at())
                _last_check = {
                    "stations": statuses,
                    "any_recommended": any(s["retrain_recommended"] for s in statuses),
                    "checked_at": datetime.utcnow().isoformat(),
                }
                _last_checked_at = datetime.utcnow()

                recommended = [s["station"] for s in statuses if s["retrain_recommended"]]
                if recommended:
                    log.warning(
                        "Retrain checker: RETRAINING RECOMMENDED for stations: %s. "
                        "Export prediction_logs and retrain via notebook.",
                        ", ".join(recommended)
                    )
                else:
                    log.info(
                        "Retrain checker: all models within threshold. "
                        "Samples: %s",
                        {s["station"]: s["empirical_samples"] for s in statuses}
                    )
        except Exception as e:
            log.error("Retrain checker: error during check — %s", e)

        await asyncio.sleep(interval_hours * 3600)
