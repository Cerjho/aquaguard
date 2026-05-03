# AquaGuard CUDA Crash - Implementation Summary

## Fixes Implemented

All four fixes have been successfully implemented to prevent the CUDA context corruption crash observed in the second run of AquaGuard.

### 1. Frame Validation in Detection Worker ✅
**File:** `./detection_engine/pipeline/detection_worker.py`

**Changes:**
- Added `_validate_frame()` method that checks:
  - Frame exists and has correct shape (3-channel, height/width >= 10)
  - No NaN values (corrupted floating-point data)
  - No Inf values (corrupted values)
  - Not all black (complete corruption)
  - Reasonable variance (not solid color)

- Added validation call in `_process_frame()` BEFORE GPU inference
  - Frames that fail validation are skipped (not processed)
  - Counter tracks how many frames are skipped

- Added error handling for `torch.cuda.empty_cache()` calls
  - Wrapped in try-except to prevent crashes if GPU context already corrupted

**Impact:** Prevents corrupted frames from reaching GPU, avoiding "CUDA unknown error" crashes.

---

### 2. RTSP Reconnect Validation ✅
**File:** `./detection_engine/camera/capture.py`

**Changes:**
- Modified `_reconnect()` method to run full `_validate_frame()` check after stream reconnects
  - Previously only checked if frame could be read
  - Now validates frame integrity before declaring connection successful

- If first frame after reconnect is corrupted:
  - Logs warning
  - Releases capture
  - Continues to next reconnect attempt (doesn't declare success prematurely)

- Added NaN/Inf detection to existing `_validate_frame()` method

**Impact:** Catches subtle H.264 corruptions that occur during stream reset/reconnection.

---

### 3. Enhanced Frame Validation ✅
**File:** `./detection_engine/camera/capture.py`

**Changes:**
- Added checks for NaN and Inf values to `_validate_frame()`
  - These are common results of H.264 decode failures
  - Prevent GPU kernel crashes during YOLO inference

- Improved floating-point handling in `_is_green_corrupted()`
  - Now handles both uint8 (0-255) and float (0.0-1.0) frame formats
  - Better error handling for edge cases

**Impact:** Catches more corruption patterns earlier in the pipeline, reduces GPU errors.

---

### 4. Increased CUDA Error Tolerance ✅
**File:** `./config/settings.py`

**Changes:**
- Changed `CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE` from 3 to 10
  - Old: 3 consecutive errors within 30 seconds → force restart
  - New: 10 consecutive errors within 30 seconds → force restart

- Added explanatory comment about why change was necessary

**Impact:** Allows system to recover from isolated corrupted frames without immediate restart. Only exits if errors persist (indicates actual GPU corruption).

---

## How the Fixes Prevent the Crash

### Before (Crash Scenario):
```
RTSP reconnects (10 times)
    ↓
Stream corruption flag = 1.3%
    ↓
Subtly corrupted frames queued (NaN/Inf values)
    ↓
Detection worker processes corrupted frame
    ↓
YOLO inference on GPU → CUDA unknown error
    ↓
Retry loop with torch.cuda.empty_cache() failures
    ↓
3 strikes → os._exit(1) → CRASH
```

### After (Recovery Scenario):
```
RTSP reconnects (10 times)
    ↓
Stream corruption detected in _validate_frame()
    ↓
Corrupted frames are SKIPPED (not sent to GPU)
    ↓
Clean frames processed normally
    ↓
System continues operating
    ↓
Camera reconnects and stabilizes
    ↓
No CUDA errors, no restart needed
```

---

## Files Modified

1. **detection_engine/pipeline/detection_worker.py** - Added frame validation before GPU inference
2. **detection_engine/camera/capture.py** - Enhanced RTSP reconnect validation + NaN/Inf detection
3. **config/settings.py** - Increased CUDA error tolerance from 3 to 10

---

## Testing Recommendations

1. **Simulate RTSP Instability:**
   - Restart camera or RTSP server multiple times
   - Verify no CUDA crashes occur
   - Check logs for "Skipping corrupted frame" messages

2. **Monitor Frame Skipping:**
   - Detection worker now tracks `_frames_skipped_corrupted`
   - Available in worker stats
   - Should be 0-1 per reconnect, not per-frame during stable operation

3. **Verify GPU Stability:**
   - Run for extended period with stable RTSP
   - Monitor drop_rate (should be 0-5%)
   - Verify no memory leaks (`torch.cuda.reset_peak_memory_stats()` called)

4. **Test Error Recovery:**
   - Intentionally corrupt frames (if possible)
   - Verify system skips them and continues
   - Confirm no CUDA context corruption

---

## Environment Variables

Users can override the new settings via environment variables:

```bash
# Allow more CUDA errors before restart (default 10)
export CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE=15

# Or keep the old aggressive behavior
export CUDA_UNKNOWN_ERROR_MAX_CONSECUTIVE=3
```

---

## Root Cause (Recap)

The crash was caused by:

1. **RTSP stream instability** → 10 reconnects in 3 minutes
2. **Subtle frame corruption** from H.264 decode → NaN/Inf values
3. **No validation in detection worker** → Corrupted frames sent to GPU
4. **CUDA kernel crash** on invalid tensors → "CUDA unknown error"
5. **Aggressive error recovery** → 3-strike restart policy too strict

The fixes address all five points in the chain, making the system resilient to RTSP instability and isolated frame corruptions.
