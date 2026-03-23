"""Optional error reporting integration for production runtime."""

import os


def init_error_reporting(app):
    """Initialize Sentry if configured; no-op when unset or unavailable."""
    dsn = (os.environ.get('SENTRY_DSN') or '').strip()
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration

        sentry_sdk.init(
            dsn=dsn,
            integrations=[FlaskIntegration()],
            traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.0')),
            environment=app.config.get('APP_ENV', 'development'),
        )
        app.logger.info('Sentry error reporting enabled')
    except ImportError:
        app.logger.warning('SENTRY_DSN is set but sentry-sdk is not installed; skipping init')
