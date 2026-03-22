export function mapEventClassLabel(event = {}, fallback = 'Person detected') {
  return (
    event.class_label
    || event.class_name
    || event.detected_class
    || event.alert_class
    || fallback
  );
}

export function mapEventConfidence(event = {}) {
  const value = (
    event.final_confidence
    ?? event.confidence_score
    ?? event.confidence
    ?? event.yolo_confidence
    ?? event.pose_confidence
    ?? null
  );
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value);
}

export function mapEventTimestamp(event = {}) {
  return (
    event.detected_at
    || event.timestamp
    || event.alerted_at
    || event.created_at
    || event.event_time
    || null
  );
}