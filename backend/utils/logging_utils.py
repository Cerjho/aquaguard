"""Logging helpers for text/JSON structured output."""

import json
import logging
import os
from datetime import datetime, timezone


class JsonLogFormatter(logging.Formatter):
    """Emit structured JSON logs for easier ingestion in aggregators."""

    def format(self, record):
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def configure_app_logging(app):
    """Configure app logger format via AQUAGUARD_LOG_FORMAT env var."""
    log_format = os.environ.get("AQUAGUARD_LOG_FORMAT", "text").strip().lower()
    if log_format != "json":
        return

    formatter = JsonLogFormatter()
    app.logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
    app.logger.propagate = False
