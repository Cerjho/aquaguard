"""
backend/wsgi.py
---------------
WSGI entry point. Used by Gunicorn in production and by Flask CLI in development.

Usage:
    flask --app wsgi run
    gunicorn "wsgi:app" -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker
    python wsgi.py  (starts SocketIO dev server)
"""

from app import create_app
from extensions import socketio

app = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
