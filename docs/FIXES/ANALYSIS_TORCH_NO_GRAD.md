# Analysis: Ultralytics YOLOv11 torch.no_grad() Behavior

## Finding: YES — Ultralytics Wraps Inference in torch.no_grad()

**Conclusion**: Gradient accumulation is NOT an issue in AquaGuard.

## Code Path

```
detector.py → self.model.track()
    ↓
ultralytics/engine/model.py → YOLO.track()
    ↓
ultralytics/engine/model.py → YOLO.predict()
    ↓
ultralytics/engine/predictor.py → DetectionPredictor()
    ↓
@torch.no_grad()  ← GRADIENT DISABLED HERE
def inference(self, im):
    return self.model(im)
```

## Evidence

1. **Official Source**: Ultralytics model.py calls `self.model.eval()` before predict
2. **Inference Method**: Wrapped with `@torch.no_grad()` decorator
3. **Version**: ultralytics==8.3.0 (from requirements-prod.txt)

## Implication for AquaGuard

- ✅ No gradient buffers accumulating in GPU VRAM
- ✅ No computational graph being built during inference
- ✅ Memory issue is NOT from gradients
- ✅ Real issue: ByteTrack state + MediaPipe native memory + frame copies

## See Also

- FIX_2_MEDIAPIPE_RESET.md — Actual memory leak source
- FIX_4_FRAME_BUFFER.md — Frame copy pressure

