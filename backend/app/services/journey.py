"""Journey-type assignment logic. Future work: replace with trained classifier."""
JOURNEYS = {
    "A": {"label": "Simple consultation",  "path": ["triage", "doctor", "pharmacy"]},
    "B": {"label": "Consultation + lab",   "path": ["triage", "doctor", "lab", "doctor", "pharmacy"]},
    "C": {"label": "Laboratory only",      "path": ["triage", "lab"]},
    "D": {"label": "Pharmacy refill",      "path": ["pharmacy"]},
}

def choose_journey(acuity: int, complaint: str | None) -> str:
    c = (complaint or "").lower()
    if acuity == 1: return "A"
    if any(k in c for k in ("refill", "prescription", "repeat")): return "D"
    if any(k in c for k in ("blood", "test", "lab", "urine", "sugar", "malaria")): return "B"
    if any(k in c for k in ("scan", "x-ray", "x ray", "ultra")): return "C"
    return "A"
