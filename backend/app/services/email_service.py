import resend
from app.config import settings
from app.services.queue_service import SERVERS
from app.models import EmailLog
from sqlalchemy.orm import Session
from app.db import SessionLocal
import logging

logger = logging.getLogger(__name__)

if settings.resend_api_key:
    resend.api_key = settings.resend_api_key

def send_patient_email(patient_id: str, to_email: str, subject: str, body_text: str):
    print("\n" + "="*50)
    print(f"📧 EMAIL DEBUG TO {to_email}:")
    print(f"Subject: {subject}")
    print(f"Body:\n{body_text}")
    print("="*50 + "\n")
    
    if settings.notification_provider != "resend" or not settings.resend_api_key:
        logger.info(f"[EMAIL STUB] To: {to_email} | Subject: {subject} | Body: {body_text}")
        try:
            db: Session = SessionLocal()
            log = EmailLog(patient_id=patient_id, email=to_email, subject=subject, body=body_text, provider="stub")
            db.add(log)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to log stub email: {e}")
        finally:
            db.close()
        return

    try:
        params = {
            "from": settings.default_sender_email,
            "to": [to_email],
            "subject": subject,
            "html": f"<p>{body_text}</p>",
        }
        resend.Emails.send(params)
        logger.info(f"Email dispatched to {to_email}")
        
        try:
            db: Session = SessionLocal()
            log = EmailLog(patient_id=patient_id, email=to_email, subject=subject, body=body_text, provider="resend")
            db.add(log)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to log resend email to DB: {e}")
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via Resend: {e}")

def format_journey_email(name: str, stages: list[dict], estimated_finish: str | None = None, journey_type: str = None, is_update: bool = False) -> tuple[str, str]:
    first_name = name.split()[0]
    subject = "Your SQHS Journey Update"
    
    if journey_type == "Z":
        subject = "Emergency Transfer - SQHS"
        body = (f"<p>Hello {first_name}, you have been transferred to the Emergency Department "
                f"for immediate attention. Please follow the signs to the Emergency Room.</p>")
        return subject, body
        
    current = next((s for s in stages if s["status"] == "current"), None)
    if not current:
        if all(s["status"] == "done" for s in stages):
            return subject, f"Hello {first_name}, you have completed all stations. Thank you for visiting!"
        return subject, f"Hello {first_name}, your journey is updated."

    station_name = current["station"].replace("_", " ").title()
    update_prefix = "Queue Update: " if is_update else ""
    body = f"<p>{update_prefix}Hello {first_name}, you are now waiting for <strong>{station_name}</strong>.</p>"
    
    p50 = current.get("waitP50", 0) or 0
    p90 = current.get("waitP90", 0) or 0
    
    has_seen_clinician = any(s["station"] in ["doctor", "emergency"] and s["status"] == "done" for s in stages)
    upcoming_stations = [s["station"].replace("_", " ").title() for s in stages if s["status"] == "upcoming"]
    
    if not has_seen_clinician:
        journey_path = ""
    elif upcoming_stations:
        journey_path = f"<p>Your path: <strong>{station_name} &rarr; {' &rarr; '.join(upcoming_stations)} &rarr; Home</strong></p>"
    else:
        journey_path = f"<p>Your path: <strong>{station_name} &rarr; Home</strong></p>"
    
    servers = SERVERS.get(current.get("station"), 1)
    pos = current.get("position")
    est_start = current.get("estStart", "?")
    est_end = current.get("estEnd", "?")
    
    if pos is None:
        return subject, body
        
    if is_update:
        if pos < servers:
            # They were already inside the room, no need to spam them
            return subject, ""
        elif pos == servers:
            # They just crossed the threshold to enter!
            body = (f"<p>Queue Update: Hello {first_name}, you are now <strong>NEXT</strong> for "
                    f"<strong>{station_name}</strong>.</p>"
                    f"<p>Please proceed to the {station_name} station <strong>immediately</strong>.</p>")
            return subject, body
        else:
            # Normal position update
            body = f"<p>Queue Update: Hello {first_name}, you are now waiting for <strong>{station_name}</strong>.</p>"
            body += f"<p>Your new queue position is <strong>#{pos}</strong>.</p>"
            body += f"<p>Estimated time: <strong>{est_start} - {est_end}</strong></p>"
            body += f"<p>This means you will wait for about <strong>{p50} - {p90} minutes</strong>.</p>"
            body += journey_path
            return subject, body
    else:
        # Not an update (just joined the queue)
        if pos <= servers:
            body = (f"<p>Hello {first_name}, you are <strong>NEXT</strong> for "
                    f"<strong>{station_name}</strong>.</p>"
                    f"<p>Please proceed to the {station_name} station <strong>immediately</strong>.</p>")
            return subject, body
        else:
            body = f"<p>Hello {first_name}, you are now waiting for <strong>{station_name}</strong>.</p>"
            body += f"<p>Your queue position is <strong>#{pos}</strong>.</p>"
            body += f"<p>Estimated time: <strong>{est_start} - {est_end}</strong></p>"
            body += f"<p>This means you will wait for about <strong>{p50} - {p90} minutes</strong>.</p>"
            body += journey_path
            return subject, body

def format_bumped_email(name: str, stages: list[dict], reason: str = None) -> tuple[str, str]:
    first_name = name.split()[0]
    subject = "Update: Your SQHS Wait Time"
    
    current = next((s for s in stages if s["status"] == "current"), None)
    if not current:
        return subject, ""

    station_name = current["station"].replace("_", " ").title()
    
    has_seen_clinician = any(s["station"] in ["doctor", "emergency"] and s["status"] == "done" for s in stages)
    upcoming_stations = [s["station"].replace("_", " ").title() for s in stages if s["status"] == "upcoming"]
    
    if not has_seen_clinician:
        journey_path = ""
    elif upcoming_stations:
        journey_path = f"<p>Your path: <strong>{station_name} &rarr; {' &rarr; '.join(upcoming_stations)} &rarr; Home</strong></p>"
    else:
        journey_path = f"<p>Your path: <strong>{station_name} &rarr; Home</strong></p>"
        
    reason_text = "a returning patient required immediate attention"
    if reason == "emergency":
        reason_text = "an emergency patient required immediate attention"
    elif reason == "urgent":
        reason_text = "an urgent case required priority attention"
        
    body = (f"<p>Hello {first_name}, your wait time for <strong>{station_name}</strong> has been updated "
            f"because {reason_text}.</p>")
    
    p50 = current.get("waitP50", 0) or 0
    if current.get("position") is not None:
        body += f"<p>New queue position: <strong>#{current['position']}</strong></p>"
        if p50 == 0:
            body += f"<p>You are still <strong>NEXT</strong> in line. Please proceed to the {station_name} station <strong>immediately</strong>.</p>"
        else:
            body += f"<p>New estimated time: <strong>{current.get('estStart', '?')} - {current.get('estEnd', '?')}</strong></p>"
        body += journey_path
        
    body += "<p>Thank you for your patience.</p>"
    return subject, body
