"""SMS Service — logs to console and persists to DB. Dispatches via Africa's Talking if enabled."""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import SMSLog
from app.config import settings
from app.services.queue_service import SERVERS

log = logging.getLogger(__name__)

sms = None
if settings.sms_provider == "africastalking" and settings.at_username and settings.at_api_key:
    try:
        import africastalking
        africastalking.initialize(settings.at_username, settings.at_api_key)
        sms = africastalking.SMS
        log.info("Africa's Talking SDK initialized successfully.")
    except ImportError:
        log.warning("africastalking package not installed. SMS dispatch will fail if provider is set to africastalking.")
    except Exception as e:
        log.error(f"Failed to initialize Africa's Talking SDK: {e}")

def format_nigerian_phone(phone: str) -> str:
    """Format Nigerian phone numbers to E.164 (+234...)."""
    cleaned = phone.replace(" ", "").replace("-", "")
    if cleaned.startswith("0"):
        return "+234" + cleaned[1:]
    if cleaned.startswith("+234"):
        return cleaned
    if cleaned.startswith("234"):
        return "+" + cleaned
    return cleaned

def format_journey_sms(patient_name: str, stages: list, estimated_finish: str = None, journey_type: str = None, is_update: bool = False) -> str:
    first_name = patient_name.split()[0]
    
    if journey_type == "Z":
        return f"Hello {first_name}, you have been transferred to the Emergency Department for immediate attention. Please follow the signs to the Emergency Room."
        
    current = next((s for s in stages if s["status"] == "current"), None)
    if not current:
        return f"Hello {first_name}, you have completed all stations. Thank you for visiting!"
        
    station_name = current["station"].replace("_", " ").title()
    pos = current.get("position", "?")
    p50 = current.get("waitP50", 0) or 0
    p90 = current.get("waitP90", 0) or 0
    est_start = current.get("estStart", "?")
    est_end = current.get("estEnd", "?")
    
    has_seen_clinician = any(s["station"] in ["doctor", "emergency"] and s["status"] == "done" for s in stages)
    upcoming_stations = [s["station"].replace("_", " ").title() for s in stages if s["status"] == "upcoming"]
    
    if not has_seen_clinician:
        journey_path = ""
    elif upcoming_stations:
        journey_path = f"\nYour path: {station_name} -> {' -> '.join(upcoming_stations)} -> Home"
    else:
        journey_path = f"\nYour path: {station_name} -> Home"
    
    # If wait time is 0, they are within active server capacity
    servers = SERVERS.get(current.get("station"), 1)
    
    if is_update:
        if pos < servers:
            # They were already inside the room, no need to spam them
            return ""
        elif pos == servers:
            # They just crossed the threshold to enter!
            return (f"Queue Update: Hello {first_name}, you are now NEXT for {station_name}.\n"
                    f"Please proceed to the {station_name} station immediately.")
        else:
            # Normal position update
            return (f"Queue Update: Hello {first_name}, you are still waiting for {station_name}.\n"
                    f"Your new queue position is #{pos}.\n"
                    f"Estimated time: {est_start} - {est_end}\n"
                    f"This means you will wait for about {p50} - {p90} minutes.{journey_path}")
    else:
        # Not an update (just joined the queue)
        if pos <= servers:
            return (f"Hello {first_name}, you are NEXT for {station_name}.\n"
                    f"Please proceed to the {station_name} station immediately.")
        else:
            return (f"Hello {first_name}, you are now waiting for {station_name}.\n"
                    f"Queue position: #{pos}\n"
                    f"Estimated time: {est_start} - {est_end}\n"
                    f"This means you will wait for about {p50} - {p90} minutes.{journey_path}")

def format_bumped_sms(patient_name: str, stages: list, reason: str = None) -> str:
    first_name = patient_name.split()[0]
    current = next((s for s in stages if s["status"] == "current"), None)
    if not current:
        return ""
    
    station_name = current["station"].replace("_", " ").title()
    pos = current.get("position", "?")
    p50 = current.get("waitP50", 0) or 0
    p90 = current.get("waitP90", 0) or 0
    est_start = current.get("estStart", "?")
    est_end = current.get("estEnd", "?")
    
    reason_text = "a returning patient required immediate attention"
    if reason == "emergency":
        reason_text = "an emergency patient required immediate attention"
    elif reason == "urgent":
        reason_text = "an urgent case required priority attention"
    
    has_seen_clinician = any(s["station"] in ["doctor", "emergency"] and s["status"] == "done" for s in stages)
    upcoming_stations = [s["station"].replace("_", " ").title() for s in stages if s["status"] == "upcoming"]
    
    if not has_seen_clinician:
        journey_path = ""
    elif upcoming_stations:
        journey_path = f"\nYour path: {station_name} -> {' -> '.join(upcoming_stations)} -> Home"
    else:
        journey_path = f"\nYour path: {station_name} -> Home"
        
    if p50 == 0:
        return (f"Hello {first_name}, your wait time for {station_name} has been updated because {reason_text}.\n"
                f"New queue position: #{pos}\n"
                f"You are still NEXT in line. Please proceed to the {station_name} station immediately.")
                
    return (f"Hello {first_name}, your wait time for {station_name} has been updated because {reason_text}.\n"
            f"New queue position: #{pos}\n"
            f"New estimated time: {est_start} - {est_end}{journey_path}\n"
            f"Thank you for your patience.")

from app.db import SessionLocal

def send_sms(patient_id: str, phone: str, body: str) -> None:
    """Log to DB and dispatch via Africa's Talking if configured."""
    formatted_phone = format_nigerian_phone(phone)
    
    print("\n" + "="*50)
    print(f"📱 SMS DEBUG TO {formatted_phone}:")
    print(body)
    print("="*50 + "\n")
    
    if settings.sms_provider == "africastalking" and settings.at_username and settings.at_api_key:
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        try:
            env = "sandbox" if settings.at_username == "sandbox" else "production"
            url = f"https://api.{'sandbox.' if env == 'sandbox' else ''}africastalking.com/version1/messaging"
            
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "apiKey": settings.at_api_key
            }
            
            data = {
                "username": settings.at_username,
                "to": formatted_phone,
                "message": body
            }
            
            if settings.at_sender_id:
                data["from"] = settings.at_sender_id
                
            # Use proxies={} to bypass any local Windows proxies (like Fiddler/Charles) that might cause SSL WRONG_VERSION_NUMBER
            response = requests.post(
                url, 
                headers=headers, 
                data=data, 
                verify=False, 
                timeout=15,
                proxies={"http": "", "https": ""}
            )
            
            if response.status_code in [200, 201]:
                log.info(f"[SMS DISPATCHED → {formatted_phone}]\nResponse: {response.json()}\n{'-'*40}")
            else:
                log.error(f"[SMS DISPATCH FAILED → {formatted_phone}]\nStatus: {response.status_code} Body: {response.text}\n{'-'*40}")
        except Exception as e:
            log.error(f"[SMS DISPATCH ERROR → {formatted_phone}]\nError: {e}\n{'-'*40}")
    else:
        log.info(f"[SMS STUB → {formatted_phone}]\n{body}\n{'-'*40}")

    db = SessionLocal()
    try:
        record = SMSLog(
            patient_id=patient_id, phone=phone, body=body,
            sent_at=datetime.utcnow(), provider=settings.sms_provider,
        )
        db.add(record)
        db.commit()
    except Exception as e:
        log.error(f"[SMS DB LOG FAILED] {e}")
    finally:
        db.close()

