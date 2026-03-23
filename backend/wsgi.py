import os

from app import create_app
from extensions import socketio

app = create_app()

if __name__ == '__main__':
    debug_enabled = os.environ.get('FLASK_DEBUG', '0').strip().lower() in {'1', 'true', 'yes'}
    allow_unsafe_werkzeug = (
        os.environ.get('ALLOW_UNSAFE_WERKZEUG', '0').strip().lower() in {'1', 'true', 'yes'}
    )
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=debug_enabled,
        use_reloader=False,
        allow_unsafe_werkzeug=(debug_enabled or allow_unsafe_werkzeug),
    )
