import os
import sys
import uuid
import random
from datetime import timedelta

# Allow running from project root or backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from models import CameraZone, DetectionEvent, Alert, SystemLog
from utils.date_utils import utcnow_naive

def add_mock_data():
    app = create_app()
    with app.app_context():
        print("Adding mock data...")
        
        # 1. Add mock Camera Zones
        mock_zones = []
        for i in range(1, 4):
            zone_id = f"mock_zone_{i}"
            if not CameraZone.query.filter_by(zone_id=zone_id).first():
                zone = CameraZone(
                    zone_id=zone_id,
                    zone_name=f"Mock Pool Area {i}",
                    rtsp_url=f"rtsp://mock.local/stream{i}",
                    location_description=f"Mock Location {i}",
                    frame_rate=30,
                    resolution='1920x1080'
                )
                db.session.add(zone)
                mock_zones.append(zone_id)
                print(f"Added camera zone: {zone_id}")
            else:
                mock_zones.append(zone_id)
                print(f"Camera zone {zone_id} already exists.")
        
        db.session.commit()

        # 2. Add mock Detection Events and Alerts
        now = utcnow_naive()
        for zone_id in mock_zones:
            for j in range(15): # 15 events per zone
                event_id = str(uuid.uuid4())
                # Spread out over the last 7 days
                detected_at = now - timedelta(days=random.randint(0, 7), hours=random.randint(0, 23), minutes=random.randint(0, 59))
                
                # 30% chance to trigger an alert
                alert_triggered = random.random() < 0.3
                
                event = DetectionEvent(
                    event_id=event_id,
                    zone_id=zone_id,
                    class_label="person",
                    confidence_score=random.uniform(0.6, 0.99),
                    behavior_flags={"drowning_risk": alert_triggered, "submerged": random.random() < 0.2},
                    alert_triggered=alert_triggered,
                    detected_at=detected_at
                )
                db.session.add(event)
                
                if alert_triggered:
                    alert = Alert(
                        alert_id=str(uuid.uuid4()),
                        event_id=event_id,
                        zone_id=zone_id,
                        status=random.choice(["unacknowledged", "acknowledged", "resolved"]),
                        triggered_at=detected_at,
                        notes="Generated mock alert" if random.random() > 0.5 else None
                    )
                    db.session.add(alert)
                    
        # 3. Add some mock System Logs
        for k in range(10):
            log_time = now - timedelta(hours=random.randint(0, 48))
            log = SystemLog(
                level=random.choice(["INFO", "WARNING", "ERROR"]),
                component=random.choice(["DetectionEngine", "API", "Database", "CameraStream"]),
                message=f"This is a mock system log message {k}",
                timestamp=log_time
            )
            db.session.add(log)
        
        db.session.commit()
        print("Mock data added successfully.")

def remove_mock_data():
    app = create_app()
    with app.app_context():
        print("Removing mock data...")
        
        # Find mock zones
        mock_zones = CameraZone.query.filter(CameraZone.zone_id.like('mock_zone_%')).all()
        zone_ids = [z.zone_id for z in mock_zones]
        
        if not zone_ids:
            print("No mock camera zones found.")
        else:
            # Find and delete alerts associated with mock events
            mock_events = DetectionEvent.query.filter(DetectionEvent.zone_id.in_(zone_ids)).all()
            event_ids = [e.event_id for e in mock_events]
            
            if event_ids:
                alerts_deleted = Alert.query.filter(Alert.event_id.in_(event_ids)).delete(synchronize_session=False)
                print(f"Deleted {alerts_deleted} mock alerts.")
                
                events_deleted = DetectionEvent.query.filter(DetectionEvent.zone_id.in_(zone_ids)).delete(synchronize_session=False)
                print(f"Deleted {events_deleted} mock detection events.")
                
            zones_deleted = CameraZone.query.filter(CameraZone.zone_id.in_(zone_ids)).delete(synchronize_session=False)
            print(f"Deleted {zones_deleted} mock camera zones.")

        # Remove mock System Logs
        logs_deleted = SystemLog.query.filter(SystemLog.message.like('This is a mock system log message%')).delete(synchronize_session=False)
        print(f"Deleted {logs_deleted} mock system logs.")
        
        db.session.commit()
        print("Mock data removed successfully.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "remove":
        remove_mock_data()
    else:
        add_mock_data()
