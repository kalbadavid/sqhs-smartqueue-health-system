# main.py — SQHS FastAPI Backend
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np
import os

app = FastAPI(title="SQHS Wait Time Prediction API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model and scaler from model/ folder
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../model/sqhs_xgboost_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "../model/sqhs_scaler.pkl")

model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

class PatientInput(BaseModel):
    hour_of_day: int
    day_of_week: int
    month: int
    medication_revenue: float
    lab_cost: float
    consultation_revenue: float
    doctor_type: str
    financial_class: str
    patient_type: str

@app.get("/")
def root():
    return {"message": "SQHS API is running"}

@app.post("/predict")
async def predict_wait_time(data: PatientInput):
    input_df = pd.DataFrame([data.dict()])
    input_encoded = pd.get_dummies(input_df)
    input_scaled = scaler.transform(
        input_encoded.reindex(columns=scaler.feature_names_in_, fill_value=0)
    )
    prediction = model.predict(input_scaled)
    return {
        "estimated_wait_time_minutes": round(float(prediction[0]), 2)
    }
