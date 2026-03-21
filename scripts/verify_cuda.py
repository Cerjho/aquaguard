"""
AquaGuard - Environment Verification Script
Run before starting the detection engine to confirm all dependencies are ready.
Usage: python scripts/verify_cuda.py
"""
import os
import sys
from pathlib import Path


def check(label, fn):
    try:
        result = fn()
        print(f"  [OK]  {label}: {result}")
        return True
    except Exception as e:
        print(f"  [FAIL] {label}: {e}")
        return False


print("\nAquaGuard Environment Check")
print("=" * 40)

results = []
repo_root = Path(__file__).resolve().parents[1]
compose_path = repo_root / "docker-compose.yml"

results.append(check("Python version", lambda: sys.version.split()[0]))
results.append(check("PyTorch", lambda: __import__("torch").__version__))
results.append(check("CUDA available", lambda: str(__import__("torch").cuda.is_available())))
results.append(
    check(
        "GPU name",
        lambda: __import__("torch").cuda.get_device_name(0)
        if __import__("torch").cuda.is_available()
        else "No GPU",
    )
)
results.append(check("Ultralytics (YOLO)", lambda: __import__("ultralytics").__version__))
results.append(check("MediaPipe", lambda: __import__("mediapipe").__version__))
results.append(check("OpenCV", lambda: __import__("cv2").__version__))
results.append(check("Flask", lambda: __import__("flask").__version__))
results.append(check("paho-mqtt", lambda: __import__("importlib.metadata").metadata.version("paho-mqtt")))

results.append(
    check(
        "Model weights",
        lambda: "Found"
        if (repo_root / "detection_engine/models/aquaguard_yolov11s.pt").exists()
        else (_ for _ in ()).throw(FileNotFoundError("aquaguard_yolov11s.pt not found")),
    )
)

results.append(
    check(
        "docker-compose coturn service",
        lambda: "Configured"
        if "coturn:" in compose_path.read_text(encoding="utf-8")
        else (_ for _ in ()).throw(ValueError("coturn service missing from docker-compose.yml")),
    )
)

results.append(
    check(
        "WebRTC env defaults in compose",
        lambda: "Configured"
        if "WEBRTC_STUN_URLS" in compose_path.read_text(encoding="utf-8")
        and "WEBRTC_TURN_URL" in compose_path.read_text(encoding="utf-8")
        else (_ for _ in ()).throw(ValueError("WEBRTC_* env vars missing from compose")),
    )
)

results.append(
    check(
        "TURN runtime env (optional)",
        lambda: os.getenv("TURN_USERNAME")
        if os.getenv("TURN_USERNAME")
        else "Not set (using docker-compose defaults)",
    )
)

print("=" * 40)
passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed == total:
    print("Environment is ready.\n")
else:
    print("Fix the failed checks before running the detection engine.\n")
    sys.exit(1)
