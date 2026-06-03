"""Quick diagnostic to verify the in-memory stream server is running."""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8765"


def check_health():
    print(f"[1] GET {BASE}/health")
    try:
        r = urllib.request.urlopen(f"{BASE}/health", timeout=5)
        data = json.loads(r.read())
        print(f"    Status: {r.status} OK")
        print(f"    Server: {data.get('server')}")
        print(f"    Zones:  {list(data.get('zones', {}).keys())}")
        for zone_id, info in data.get("zones", {}).items():
            print(f"      - {zone_id}: has_frame={info['has_frame']}, writes={info['total_writes']}")
        return list(data.get("zones", {}).keys())
    except urllib.error.URLError as e:
        print(f"    FAILED: {e.reason}")
        return []


def check_snapshot(zone_id):
    print(f"\n[2] GET {BASE}/frame/{zone_id}")
    try:
        r = urllib.request.urlopen(f"{BASE}/frame/{zone_id}", timeout=5)
        data = r.read()
        is_jpeg = data[:2] == b'\xff\xd8'
        print(f"    Status: {r.status} OK")
        print(f"    Content-Type: {r.headers['Content-Type']}")
        print(f"    Size: {len(data)} bytes")
        print(f"    Valid JPEG: {is_jpeg}")
        return True
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.reason}")
        return False
    except urllib.error.URLError as e:
        print(f"    FAILED: {e.reason}")
        return False


def check_stream(zone_id):
    print(f"\n[3] GET {BASE}/stream/{zone_id} (reading first chunk)")
    import socket
    try:
        sock = socket.create_connection(("127.0.0.1", 8765), timeout=3)
        sock.sendall(f"GET /stream/{zone_id} HTTP/1.0\r\n\r\n".encode())
        data = b""
        while len(data) < 8192:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"image/jpeg" in data:
                break
        sock.close()
        text = data.decode("latin-1", errors="replace")
        has_multipart = "multipart/x-mixed-replace" in text
        has_jpeg = "image/jpeg" in text
        print(f"    Multipart header: {has_multipart}")
        print(f"    JPEG content: {has_jpeg}")
        print(f"    Bytes received: {len(data)}")
        return has_multipart and has_jpeg
    except Exception as e:
        print(f"    FAILED: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("AquaGuard Stream Server Diagnostic")
    print("=" * 50)

    zones = check_health()
    if not zones:
        print("\n❌ Stream server is NOT running on port 8765")
        sys.exit(1)

    zone = zones[0]
    snap_ok = check_snapshot(zone)
    stream_ok = check_stream(zone)

    print("\n" + "=" * 50)
    if snap_ok and stream_ok:
        print("✅ Stream server is WORKING — all checks passed")
    elif snap_ok:
        print("⚠️  Snapshot works but MJPEG stream has issues")
    else:
        print("❌ Stream server has problems")
    print("=" * 50)
