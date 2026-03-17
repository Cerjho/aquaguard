def test_summary_requires_auth(client):
    resp = client.get('/api/v1/reports/summary')
    assert resp.status_code == 401


def test_summary(client, admin_token):
    resp = client.get('/api/v1/reports/summary',
                      headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'total_detections' in data
    assert 'confirmed_alerts' in data
    assert 'false_positives_suppressed' in data
    assert 'by_zone' in data
    assert isinstance(data['by_zone'], list)


def test_summary_date_range(client, admin_token):
    resp = client.get(
        '/api/v1/reports/summary?from=2024-01-01T00:00:00&to=2024-12-31T23:59:59',
        headers={'Authorization': f'Bearer {admin_token}'}
    )
    assert resp.status_code == 200


def test_summary_invalid_dates(client, admin_token):
    # Invalid dates should be ignored gracefully — not crash
    resp = client.get(
        '/api/v1/reports/summary?from=bad-date&to=also-bad',
        headers={'Authorization': f'Bearer {admin_token}'}
    )
    assert resp.status_code == 200
