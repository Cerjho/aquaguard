from extensions import db
from utils.date_utils import utcnow_naive, serialize_datetime


class User(db.Model):
    __tablename__ = 'users'

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20), nullable=False, default='lifeguard')
    created_at    = db.Column(db.DateTime, default=utcnow_naive)
    is_active     = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<User {self.username} ({self.role})>'

    def to_dict(self):
        return {
            'id':         self.id,
            'username':   self.username,
            'role':       self.role,
            'created_at': serialize_datetime(self.created_at),
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
    status               = db.Column(
        db.String(20),
        nullable=False,
        default='active',
        index=True,
        # Valid values: 'active' | 'inactive' | 'deleted'
        # 'deleted' is the soft-delete sentinel — excluded from all listings.
    )
    created_at           = db.Column(db.DateTime, default=utcnow_naive)

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
            'status':               self.status,
            'created_at':           serialize_datetime(self.created_at),
        }


class DetectionEvent(db.Model):
    __tablename__ = 'detection_events'
    __table_args__ = (
        db.Index('ix_detection_events_zone_detected_at', 'zone_id', 'detected_at'),
        db.Index(
            'ix_detection_events_zone_alert_detected_at',
            'zone_id',
            'alert_triggered',
            'detected_at',
        ),
        db.Index(
            'ix_detection_events_alert_detected_at',
            'alert_triggered',
            'detected_at',
        ),
    )

    id               = db.Column(db.Integer, primary_key=True)
    event_id         = db.Column(db.String(36), unique=True, nullable=False)
    zone_id          = db.Column(db.String(50), nullable=False, index=True)
    track_id         = db.Column(db.Integer)
    class_label      = db.Column(db.String(64), nullable=True)
    yolo_confidence  = db.Column(db.Float, nullable=True)
    pose_confidence  = db.Column(db.Float, nullable=True)
    final_confidence = db.Column(db.Float, nullable=True)
    confidence_score = db.Column(db.Float)
    behavior_flags   = db.Column(db.JSON)
    bbox             = db.Column(db.JSON, nullable=True)
    alert_triggered  = db.Column(db.Boolean, default=False, index=True)
    snapshot_path    = db.Column(db.String(255))
    detected_at      = db.Column(db.DateTime, default=utcnow_naive, index=True)
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
            'bbox':             self.bbox,
            'alert_triggered':  self.alert_triggered,
            'snapshot_path':    self.snapshot_path,
            'detected_at':      serialize_datetime(self.detected_at),
        }


