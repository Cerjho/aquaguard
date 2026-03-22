export function resolveAlertId(payloadOrId) {
  if (payloadOrId == null) return null;

  if (typeof payloadOrId === 'string' || typeof payloadOrId === 'number') {
    return String(payloadOrId);
  }

  if (typeof payloadOrId !== 'object') return null;

  return (
    payloadOrId.alert_id
    || payloadOrId.id
    || payloadOrId.alert?.alert_id
    || payloadOrId.alert?.id
    || null
  );
}

export function normalizeAlertPayload(payload = {}) {
  const normalized = { ...payload };
  const canonicalAlertId = resolveAlertId(payload);

  const confidence = (
    payload.confidence
    ?? payload.final_confidence
    ?? payload.confidence_score
    ?? payload.alert?.confidence
    ?? payload.alert?.final_confidence
    ?? payload.alert?.confidence_score
    ?? null
  );

  const alertedAt = (
    payload.alerted_at
    ?? payload.triggered_at
    ?? payload.timestamp
    ?? payload.detected_at
    ?? payload.alert?.alerted_at
    ?? payload.alert?.triggered_at
    ?? payload.alert?.timestamp
    ?? payload.alert?.detected_at
    ?? null
  );

  const snapshotPath = (
    payload.snapshot_url
    ?? payload.alert?.snapshot_url
    ?? payload.frame_snapshot_path
    ?? payload.snapshot_path
    ?? payload.alert?.frame_snapshot_path
    ?? payload.alert?.snapshot_path
    ?? null
  );

  return {
    ...normalized,
    alert_id: canonicalAlertId,
    id: canonicalAlertId || normalized.id,
    confidence,
    alerted_at: alertedAt,
    frame_snapshot_path: snapshotPath,
  };
}
