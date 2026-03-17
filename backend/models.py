"""
backend/models.py
-----------------
SQLAlchemy ORM models for the AquaGuard system.

Models
------
User            — lifeguard / admin user accounts
CameraZone      — registered camera zones
DetectionEvent  — individual drowning-detection events from the CV engine
Alert           — alert records derived from DetectionEvents
SystemLog       — application-level logging to the database
"""

from datetime import datetime
from extensions import db


# ─────────────────────────────────────────────────────────────────────────────
# User
# ─────────────────────────────────────────────────────────────────────────────

class User(db.Model):
    """Lifeguard or admin user account."""

    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='lifeguard')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    # Relationship: alerts acknowledged by this user
    acknowledged_alerts = db.relationship(
        'Alert',
        foreign_keys='Alert.acknowledged_by',
        backref='acknowledging_user',
        lazy='dynamic'
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active,
        }

    def __repr__(self) -> str:
        return f'<User id={self.id} username={self.username!r} role={self.role!r}>'


# ─────────────────────────────────────────────────────────────────────────────
# CameraZone
# ─────────────────────────────────────────────────────────────────────────────

class CameraZone(db.Model):
    """Registered camera zone (pool area monitored by one camera)."""

    __tablename__ = 'camera_zones'

    id = db.Column(db.Integer, primary_key=True)
    zone_id = db.Column(
        db.String(50), unique=True, nullable=False, index=True
    )
    zone_name = db.Column(db.String(100), nullable=False)
    rtsp_url = db.Column(db.String(255), nullable=False)
    location_description = db.Column(db.String(255), nullable=True)
    frame_rate = db.Column(db.Integer, nullable=False, default=30)
    resolution = db.Column(db.String(20), nullable=False, default='1280x720')
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'zone_id': self.zone_id,
            'zone_name': self.zone_name,
            'rtsp_url': self.rtsp_url,
            'location_description': self.location_description,
            'frame_rate': self.frame_rate,
            'resolution': self.resolution,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f'<CameraZone id={self.id} zone_id={self.zone_id!r} '
            f'active={self.is_active}>'
        )


# ─────────────────────────────────────────────────────────────────────────────
# DetectionEvent
# ─────────────────────────────────────────────────────────────────────────────

class DetectionEvent(db.Model):
    """
    Single drowning-detection event produced by the CV pipeline.

    One event per evaluated track frame. If alert_triggered=True, a
    corresponding Alert record is also created.
    """

    __tablename__ = 'detection_events'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(36), unique=True, nullable=False)
    zone_id = db.Column(db.String(50), nullable=False, index=True)
    track_id = db.Column(db.Integer, nullable=True)
    confidence_score = db.Column(db.Float, nullable=False)
    behavior_flags = db.Column(db.JSON, nullable=True)
    alert_triggered = db.Column(
        db.Boolean, nullable=False, default=False, index=True
    )
    snapshot_path = db.Column(db.String(255), nullable=True)
    detected_at = db.Column(db.DateTime, nullable=False, index=True)
    raw_payload = db.Column(db.JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'event_id': self.event_id,
            'zone_id': self.zone_id,
            'track_id': self.track_id,
            'confidence_score': self.confidence_score,
            'behavior_flags': self.behavior_flags,
            'alert_triggered': self.alert_triggered,
            'snapshot_path': self.snapshot_path,
            'detected_at': (
                self.detected_at.isoformat() if self.detected_at else None
            ),
            'raw_payload': self.raw_payload,
        }

    def __repr__(self) -> str:
        return (
            f'<DetectionEvent event_id={self.event_id!r} '
            f'zone_id={self.zone_id!r} alert={self.alert_triggered}>'
        )


# ─────────────────────────────────────────────────────────────────────────────
# Alert
# ─────────────────────────────────────────────────────────────────────────────

class Alert(db.Model):
    """
    Alert record — created when a DetectionEvent has alert_triggered=True.

    Lifecycle: unacknowledged → acknowledged
    """

    __tablename__ = 'alerts'

    id = db.Column(db.Integer, primary_key=True)
    alert_id = db.Column(db.String(36), unique=True, nullable=False)
    event_id = db.Column(
        db.String(36),
        db.ForeignKey('detection_events.event_id'),
        nullable=False
    )
    zone_id = db.Column(db.String(50), nullable=False, index=True)
    status = db.Column(
        db.String(30), nullable=False, default='unacknowledged', index=True
    )
    triggered_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    acknowledged_by = db.Column(
        db.Integer,
        db.ForeignKey('users.id'),
        nullable=True
    )
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'alert_id': self.alert_id,
            'event_id': self.event_id,
            'zone_id': self.zone_id,
            'status': self.status,
            'triggered_at': (
                self.triggered_at.isoformat() if self.triggered_at else None
            ),
            'acknowledged_by': self.acknowledged_by,
            'acknowledged_at': (
                self.acknowledged_at.isoformat()
                if self.acknowledged_at else None
            ),
            'notes': self.notes,
        }

    def __repr__(self) -> str:
        return (
            f'<Alert alert_id={self.alert_id!r} zone_id={self.zone_id!r} '
            f'status={self.status!r}>'
        )


# ─────────────────────────────────────────────────────────────────────────────
# SystemLog
# ─────────────────────────────────────────────────────────────────────────────

class SystemLog(db.Model):
    """Application-level log entry stored in the database."""

    __tablename__ = 'system_logs'

    id = db.Column(db.Integer, primary_key=True)
    level = db.Column(db.String(10), nullable=False)       # INFO, WARNING, ERROR
    component = db.Column(db.String(50), nullable=False)   # e.g. "detection_engine"
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'level': self.level,
            'component': self.component,
            'message': self.message,
            'timestamp': (
                self.timestamp.isoformat() if self.timestamp else None
            ),
        }

    def __repr__(self) -> str:
        return (
            f'<SystemLog id={self.id} level={self.level!r} '
            f'component={self.component!r}>'
        )
