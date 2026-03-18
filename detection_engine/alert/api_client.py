"""API client — HTTP client for logging detection events to the Flask backend."""
import logging
import requests

from detection_engine.models_data.alert_payload import AlertPayload

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT_SECONDS = 5


class APIClient:
    """Posts detection events to the AquaGuard Flask REST API.

    All network errors are caught and logged — the detection loop must never
    crash due to a transient API failure.
    """

    def __init__(self, base_url: str, api_key: str):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        })

    def log_event(self, payload: AlertPayload) -> None:
        """POST alert payload to /api/v1/events.

        Args:
            payload: AlertPayload dataclass instance.
        """
        url = f"{self._base_url}/api/v1/events"
        data = {
            "event_id": payload.event_id,
            "zone_id": payload.zone_id,
            "track_id": payload.track_id,
            "confidence_score": payload.score,
            "behavior_flags": {},
            "snapshot_base64": payload.snapshot_b64,
            "detected_at": payload.timestamp,
            "alert_triggered": True,
        }
        try:
            response = self._session.post(url, json=data, timeout=_REQUEST_TIMEOUT_SECONDS)
            if response.status_code not in (200, 201):
                logger.error(
                    "API log_event returned %d: %s",
                    response.status_code,
                    response.text[:200],
                )
        except requests.exceptions.ConnectionError as exc:
            logger.error("API connection error (log_event): %s", exc)
        except requests.exceptions.Timeout:
            logger.error("API request timed out after %ds", _REQUEST_TIMEOUT_SECONDS)
        except Exception as exc:
            logger.error("Unexpected API error (log_event): %s", exc)
