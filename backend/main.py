# main.py — Thin entry-point so `uvicorn main:app` works.
# All logic lives in the `app` package.
from app.main import app  # noqa: F401
