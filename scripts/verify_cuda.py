"""
AquaGuard - Environment Verification Script
Run before starting the detection engine to confirm all dependencies are ready.
Usage: python scripts/verify_cuda.py
"""
import sys


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

results.append(check("Python version", lambda: sys.version.split()[0]))

results.append(check("PyTorch", lambda: __import__('torch').__version__))

results.append(
    check("CUDA available", lambda: str(__import__('torch').cuda.is_available()))
)

results.append(
    check(
        "GPU name",
        lambda: __import__('torch').cuda.get_device_name(0)
        if __import__('torch').cuda.is_available()
        else "No GPU",
    )
)

results.append(check("Ultralytics (YOLO)", lambda: __import__('ultralytics').__version__))

results.append(check("MediaPipe", lambda: __import__('mediapipe').__version__))

results.append(check("OpenCV", lambda: __import__('cv2').__version__))

results.append(check("Flask", lambda: __import__('flask').__version__))

results.append(check("paho-mqtt", lambda: __import__('paho.mqtt').__version__))

results.append(
    check(
        "Model weights",
        lambda: "Found"
        if __import__('os').path.exists("detection_engine/models/aquaguard_yolov11s.pt")
        else (_ for _ in ()).throw(FileNotFoundError("aquaguard_yolov11s.pt not found")),
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
