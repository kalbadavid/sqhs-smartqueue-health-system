// =========================================================================
//  SQHS API Client
//  ------------------------------------------------------------------------
//  Handles HTTP communication with the FastAPI backend.
// =========================================================================

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ------------------------------------------------------------
// Low-level fetch wrapper — handles errors and JSON parsing.
// ------------------------------------------------------------
async function api(path, options = {}) {
  const url = `${BASE}${path}`;
  const opts = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  };
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (err) {
    throw new Error(`Network error: cannot reach backend at ${BASE}. Is the server running?`);
  }
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.detail) {
        if (Array.isArray(body.detail)) {
          detail = body.detail.map(d => d.msg).join(', ');
        } else {
          detail = body.detail;
        }
      }
    } catch (_) { /* ignore */ }
    throw new Error(detail);
  }
  return resp.json();
}

// ------------------------------------------------------------
// Public API surface
// ------------------------------------------------------------
export async function registerPatient({ name, phone, email }) {
  return api('/patients', {
    method: 'POST',
    body: JSON.stringify({ name, phone, email }),
  });
}

export async function getTodayPatientCount() {
  return api('/patients/today-count');
}

export async function triagePatient({ id, acuity, complaint }) {
  return api('/journey', {
    method: 'POST',
    body: JSON.stringify({ id, acuity, complaint }),
  });
}

export async function getJourneyForPatient(id) {
  return api(`/patients/${encodeURIComponent(id)}/journey`);
}

export async function getQueueSummary() {
  return api('/dashboard/summary');
}

export async function getStationQueue(station) {
  return api(`/queue/${encodeURIComponent(station)}`);
}

export async function getPendingLabResults() {
  return api('/queue/lab/pending');
}

export async function collectLabSample(patientId) {
  return api('/station/lab/collect', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
  });
}

export async function getRecommendations() {
  return api('/dashboard/recommendations');
}

export async function getAnalytics(days = 7) {
  return api(`/dashboard/analytics?days=${days}`);
}

export async function advancePatient(patientId, nextJourney = null) {
  // The backend infers the current station from the patient's record, but the
  // path requires us to name a station. We hit /journey first to learn it.
  const journey = await getJourneyForPatient(patientId);
  const current = journey.stages.find(s => s.status === 'current' || s.status === 'pending_results');
  if (!current) {
    throw new Error('Patient has no current station to advance from');
  }
  return api(`/station/${encodeURIComponent(current.station)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId, next_journey: nextJourney }),
  });
}

export async function skipPatient(patientId) {
  const journey = await getJourneyForPatient(patientId);
  const current = journey.stages.find(s => s.status === 'current');
  if (!current) {
    throw new Error('Patient has no current station to skip from');
  }
  return api(`/station/${encodeURIComponent(current.station)}/skip`, {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
  });
}

export async function getTriageQueue() {
  return getStationQueue('triage');
}

export async function enterPatient(patientId) {
  const journey = await getJourneyForPatient(patientId);
  const current = journey.stages.find(s => s.status === 'current');
  if (!current) {
    throw new Error('Patient has no current station to enter');
  }
  return api(`/station/${encodeURIComponent(current.station)}/enter`, {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
  });
}

// ------------------------------------------------------------
// Static metadata used by components — same as before
// ------------------------------------------------------------
export const STATIONS = ['triage', 'doctor', 'lab', 'pharmacy', 'emergency'];

export const JOURNEYS = {
  A: { label: 'Simple consultation',  path: ['triage', 'doctor', 'pharmacy'] },
  B: { label: 'Consultation + lab',   path: ['triage', 'doctor', 'lab', 'doctor', 'pharmacy'] },
  C: { label: 'Laboratory only',      path: ['triage', 'lab'] },
  D: { label: 'Pharmacy refill',      path: ['pharmacy'] },
  E: { label: 'Consultation + lab (no return)', path: ['triage', 'doctor', 'lab'] },
  F: { label: 'Consultation + lab + pharmacy', path: ['triage', 'doctor', 'lab', 'pharmacy'] },
  Z: { label: 'Emergency Transfer', path: ['triage', 'emergency'] },
};

export const STATION_META = {
  triage:   { label: 'Nurse triage',         tone: 'triage',   source: 'simulated', role: 'Nurses' },
  doctor:   { label: 'Doctor consultation',  tone: 'doctor',   source: 'empirical', role: 'Doctors' },
  lab:      { label: 'Laboratory',           tone: 'lab',      source: 'simulated', role: 'Technicians' },
  pharmacy: { label: 'Pharmacy',             tone: 'pharmacy', source: 'empirical', role: 'Pharmacists' },
  emergency: { label: 'Emergency Dept.',     tone: 'emergency', source: 'real-time', role: 'Emergency Doctors' },
};
