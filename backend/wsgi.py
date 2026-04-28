import os

from app import create_app
from extensions import socketio

app = create_app()

from utils.env_utils import is_truthy

if __name__ == '__main__':
    debug_enabled = is_truthy(os.environ.get('FLASK_DEBUG', '0'))
    allow_unsafe_werkzeug = is_truthy(os.environ.get('ALLOW_UNSAFE_WERKZEUG', '0'))
    port = int(os.environ.get('PORT', '5000'))
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=debug_enabled,
        use_reloader=False,
        allow_unsafe_werkzeug=(debug_enabled or allow_unsafe_werkzeug),
    )
