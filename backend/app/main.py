import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import Base, engine, SessionLocal
from app.ml.loader import load_all_models, models_loaded
from app.seed import seed_database
from app.api.patients import router as patients_router
from app.api.stations import router as stations_router
from app.api.dashboard import router as dashboard_router

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("sqhs")

app = FastAPI(
    title="SQHS Backend",
    version="0.1.0",
    description="SmartQueue Health System backend — FastAPI + SQLite + quantile XGBoost",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients_router)
app.include_router(stations_router)
app.include_router(dashboard_router)

@app.on_event("startup")
def on_startup() -> None:
    log.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    log.info("Loading models...")
    load_all_models()
    loaded = models_loaded()
    log.info(f"Model load status: {loaded}")
    if not all(loaded.values()):
        log.warning("Some models failed to load — endpoints will use deterministic "
                    "fallbacks for missing stations.")

    if settings.seed_on_startup:
        log.info("Seeding database...")
        with SessionLocal() as db:
            seed_database(db)
        log.info("Seed complete.")

@app.get("/", tags=["health"])
def root():
    return {
        "service": "SQHS Backend",
        "version": "0.1.0",
        "models_loaded": models_loaded(),
    }

@app.get("/healthz", tags=["health"])
def health():
    return {"status": "ok"}
