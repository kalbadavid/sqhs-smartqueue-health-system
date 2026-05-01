# SmartQueue Health System (SQHS)

This is the monorepo for the SmartQueue Health System, containing both the FastAPI backend and the React frontend.

## Backend

FastAPI service for the SmartQueue Health System.

### Quick start

    cd backend
    python -m venv venv

    # Windows:
    .\venv\Scripts\Activate.ps1
    # Mac/Linux:
    source venv/bin/activate

    pip install -r requirements.txt
    cp .env.example .env       # or `copy` on Windows

    # Windows:
    .\run.ps1
    # Mac/Linux:
    ./run.sh

Browse to http://localhost:8000/docs for the interactive Swagger UI.

### Running the server locally

Once the one-time setup above is done, this is how you start the backend
in any new terminal session:

**Windows (PowerShell):**

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the shortcut script:

```powershell
cd backend
.\run.ps1
```

**Mac / Linux:**

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the shortcut script:

```bash
cd backend
./run.sh
```

The server will start on **http://localhost:8000**. You should see all four
models load successfully in the startup log:

```
INFO sqhs: Model load status: {'triage': True, 'doctor': True, 'lab': True, 'pharmacy': True}
```

To stop the server, press `Ctrl+C`. To deactivate the virtual environment,
type `deactivate`.

### Architecture

- FastAPI on Uvicorn, port 8000
- SQLite at `backend/sqhs.db` (auto-created, seeded on first start)
- Loads four pre-trained quantile XGBoost models from `sqhs_artifacts/{station}/*.pkl`
- SMS dispatch is **stubbed** — payloads are logged to console and persisted to `sms_log` table

#### Prediction design

- **Dashboard summary** uses queue-theoretic (M/M/c) estimation for station wait
  times. This is the standard approach for live queue dashboards and never produces
  negative or nonsensical values.
- **Patient journey predictions** (per-patient SMS) use the trained quantile XGBoost
  models. This is exactly what the models were trained and validated for — predicting
  an individual patient's wait given their arrival features.

### Model directory layout

The trained models must live in the root `sqhs_artifacts/` folder:

    sqhs_artifacts/
    ├── triage/
    │   ├── point_model.pkl
    │   ├── p50_model.pkl
    │   ├── p90_model.pkl
    │   ├── scaler.pkl
    │   └── features.pkl
    ├── doctor/   # (same five files)
    ├── lab/      # (same five files)
    └── pharmacy/ # (same five files)

If a station's model files are missing, the backend falls back to deterministic
defaults so the service still starts cleanly.

---

## Frontend

The frontend is a React application powered by Vite.

### Running the frontend locally

1. **Open a new terminal** and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. **Install dependencies** (only needed the first time):
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

The frontend will start on **http://localhost:5173**.

### Frontend API wiring

The frontend (`frontend/src/api/api.js`) is fully connected to the
backend via HTTP. It uses the following endpoints:

| Method | Endpoint                        | Purpose                          |
|--------|---------------------------------|----------------------------------|
| POST   | `/patients`                     | Register a new patient           |
| POST   | `/journey`                      | Start a patient's triage journey |
| GET    | `/patients/{id}/journey`        | Fetch a patient's journey status |
| GET    | `/queue/{station}`              | List patients in a station queue |
| POST   | `/station/{station}/complete`   | Advance a patient to next stage  |
| GET    | `/dashboard/summary`            | Live dashboard KPIs and stats    |
| GET    | `/dashboard/recommendations`    | SHAP-driven action suggestions   |

The base URL defaults to `http://localhost:8000` and can be overridden with
the `VITE_API_BASE_URL` environment variable in the frontend.
