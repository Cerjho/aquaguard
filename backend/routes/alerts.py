"""
backend/routes/alerts.py
-------------------------
Alert management blueprint.

Endpoints
---------
GET  /api/v1/alerts                       — list alerts (jwt required)
POST /api/v1/alerts/<alert_id>/acknowledge — acknowledge alert (jwt required)
"""

import logging
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models import Alert

logger = logging.getLogger(__name__)

alerts_bp = Blueprint('alerts', __name__, url_prefix='/api/v1')


@alerts_bp.route('/alerts', methods=['GET'])
@jwt_required()
def list_alerts():
    """
    Return a list of alerts.

    Query parameters:
        status (str, optional) — filter by status (e.g. 'unacknowledged')

    Returns:
        200: {alerts: [Alert.to_dict(), ...]}
    """
    status_filter = request.args.get('status')
    query = Alert.query.order_by(Alert.triggered_at.desc())

    if status_filter:
        query = query.filter(Alert.status == status_filter)

    alerts = query.all()
    return jsonify({'alerts': [a.to_dict() for a in alerts]}), 200


@alerts_bp.route('/alerts/<alert_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge_alert(alert_id: str):
    """
    Acknowledge an alert by its alert_id string (UUID).

    Args:
        alert_id: The alert UUID from the URL path.

    Request body (JSON, optional):
        notes (str) — optional acknowledgement notes

    Returns:
        200: updated Alert.to_dict()
        404: alert not found
        409: alert already acknowledged
        500: database error
    """
    alert = Alert.query.filter_by(alert_id=alert_id).first_or_404()

    if alert.status == 'acknowledged':
        return jsonify({
            'error': 'Alert already acknowledged',
            'alert': alert.to_dict(),
        }), 409

    data = request.get_json(silent=True) or {}
    current_user_id = get_jwt_identity()

    alert.status = 'acknowledged'
    alert.acknowledged_by = int(current_user_id)
    alert.acknowledged_at = datetime.utcnow()
    if data.get('notes'):
        alert.notes = data['notes']

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to acknowledge alert %s: %s", alert_id, exc)
        return jsonify({'error': 'Database error acknowledging alert'}), 500

    return jsonify(alert.to_dict()), 200
