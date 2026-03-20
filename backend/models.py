from datetime import datetime
from extensions import db


class User(db.Model):
    __tablename__ = 'users'

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20), nullable=False, default='lifeguard')
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    is_active     = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<User {self.username} ({self.role})>'

    def to_dict(self):
        return {
            'id':         self.id,
            'username':   self.username,
            'role':       self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active':  self.is_active,
        }


class CameraZone(db.Model):
    __tablename__ = 'camera_zones'

    id                   = db.Column(db.Integer, primary_key=True)
    zone_id              = db.Column(db.String(50), unique=True, nullable=False, index=True)
    zone_name            = db.Column(db.String(100), nullable=False)
    rtsp_url             = db.Column(db.String(255), nullable=False)
    location_description = db.Column(db.String(255))
    frame_rate           = db.Column(db.Integer, default=30)
    resolution           = db.Column(db.String(20), default='1280x720')
    is_active            = db.Column(db.Boolean, default=True)
    created_at           = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<CameraZone {self.zone_id}: {self.zone_name}>'

    def to_dict(self):
        return {
            'id':                   self.id,
            'zone_id':              self.zone_id,
            'zone_name':            self.zone_name,
            'rtsp_url':             self.rtsp_url,
            'location_description': self.location_description,
            'frame_rate':           self.frame_rate,
            'resolution':           self.resolution,
            'is_active':            self.is_active,
            'created_at':           self.created_at.isoformat() if self.created_at else None,
        }


class DetectionEvent(db.Model):
    __tablename__ = 'detection_events'

    id               = db.Column(db.Integer, primary_key=True)
    event_id         = db.Column(db.String(36), unique=True, nullable=False)
    zone_id          = db.Column(db.String(50), nullable=False, index=True)
    track_id         = db.Column(db.Integer)
    class_label      = db.Column(db.String(50))
    yolo_confidence  = db.Column(db.Float)
    pose_confidence  = db.Column(db.Float)
    final_confidence = db.Column(db.Float)
    confidence_score = db.Column(db.Float)
    behavior_flags   = db.Column(db.JSON)
    alert_triggered  = db.Column(db.Boolean, default=False, index=True)
    snapshot_path    = db.Column(db.String(255))
    detected_at      = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    raw_payload      = db.Column(db.JSON)

    def __repr__(self):
        return f'<DetectionEvent {self.event_id} zone={self.zone_id}>'

    def to_dict(self):
        return {
            'id':               self.id,
            'event_id':         self.event_id,
            'zone_id':          self.zone_id,
            'track_id':         self.track_id,
            'class_label':      self.class_label,
            'yolo_confidence':  self.yolo_confidence,
            'pose_confidence':  self.pose_confidence,
            'final_confidence': self.final_confidence,
            'confidence_score': self.confidence_score,
            'behavior_flags':   self.behavior_flags,
            'alert_triggered':  self.alert_triggered,
            'snapshot_path':    self.snapshot_path,
            'detected_at':      self.detected_at.isoformat() if self.detected_at else None,
        }


class Alert(db.Model):
    __tablename__ = 'alerts'

    id              = db.Column(db.Integer, primary_key=True)
    alert_id        = db.Column(db.String(36), unique=True, nullable=False)
    event_id        = db.Column(
        db.String(36), db.ForeignKey('detection_events.event_id'), nullable=False
    )
    zone_id         = db.Column(db.String(50), nullable=False, index=True)
    status          = db.Column(db.String(30), default='unacknowledged', index=True)
    triggered_at    = db.Column(db.DateTime, default=datetime.utcnow)
    acknowledged_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    notes           = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<Alert {self.alert_id} zone={self.zone_id} status={self.status}>'

    def to_dict(self):
        return {
            'id':               self.id,
            'alert_id':         self.alert_id,
            'event_id':         self.event_id,
            'zone_id':          self.zone_id,
            'status':           self.status,
            'triggered_at':     self.triggered_at.isoformat() if self.triggered_at else None,
            'acknowledged_by':  self.acknowledged_by,
            'acknowledged_at':  self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'notes':            self.notes,
        }


class SystemLog(db.Model):
    __tablename__ = 'system_logs'

    id        = db.Column(db.Integer, primary_key=True)
    level     = db.Column(db.String(10), nullable=False)
    component = db.Column(db.String(50))
    message   = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<SystemLog [{self.level}] {self.component}: {self.message[:40]}>'

    def to_dict(self):
        return {
            'id':        self.id,
            'level':     self.level,
            'component': self.component,
            'message':   self.message,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
        }
