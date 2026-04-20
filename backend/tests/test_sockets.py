import sockets as sockets_module


class _DummyRequest:
    sid = 'test-sid'


def test_handle_disconnect_accepts_reason_argument(monkeypatch):
    captured = {}

    def fake_info(message, *args):
        captured['message'] = message
        captured['args'] = args

    monkeypatch.setattr(sockets_module, 'request', _DummyRequest())
    monkeypatch.setattr(sockets_module.logger, 'info', fake_info)

    sockets_module.handle_disconnect('transport close')

    assert captured['message'] == 'WebSocket disconnect: sid=%s reason=%s'
    assert captured['args'] == ('test-sid', 'transport close')
