# Annotation Loss Fix - Deployment & Monitoring Guide

## Quick Start

### 1. Verify Fix Is Applied

```bash
# Windows
.\verify_annotation_fix.bat

# Linux/macOS
bash verify_annotation_fix.sh
```

Expected output:
```
[OK] Drain loop fix found in pipeline_manager.py
[OK] Drain loop while loop present
[OK] Annotated frame update calls present
[OK] Separate raw frame buffer exists
[OK] Separate annotated frame buffer exists
[OK] Priority logic (annotated > raw) present
```

### 2. Build Docker Images

```bash
docker-compose build
```

Expected output:
```
Image aquaguard-detection_engine Built
Image aquaguard-backend Built
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Verify Services Running

```bash
docker-compose ps
```

Expected:
```
CONTAINER         STATUS
aquaguard_backend              Up
aquaguard-detection_engine     Up
```

---

## Monitoring the Fix

### Monitor Real-Time Logs

```bash
# All services
docker-compose logs -f

# Detection engine only
docker-compose logs -f detection_engine

# Backend only
docker-compose logs -f backend
```

### Look for Drain Loop Telemetry

Every 10 seconds, you should see:

```
[zone_1] Feeder: 30.0 FPS fed, queue drop_rate=0.0%, annotated drained=10/sec
```

**Metrics explained:**
- `30.0 FPS fed` = Camera is capturing at 30 FPS ✓
- `queue drop_rate=0.0%` = No frame drops ✓
- `annotated drained=10/sec` = Detection producing ~10 annotated frames/sec ✓

### Monitor Detection Engine Health

```bash
# Check if detection_engine container is stable
docker stats aquaguard-detection_engine

# Watch for restarts (should be 0)
docker inspect aquaguard-detection_engine | grep -i restart
```

---

## Testing Annotation Visibility

### 1. Get Stream Token

```bash
curl -X GET http://localhost:8000/api/v1/cameras/{zone_id}/stream-token \
  -H "Authorization: Bearer {your_jwt_token}"
```

Response:
```json
{
  "zone_id": "zone_1",
  "stream_token": "eyJz...",
  "ttl_seconds": 30,
  "expires_at": "2024-04-29T10:00:00+00:00"
}
```

### 2. Access MJPEG Stream

```bash
# Using the token
curl -v "http://localhost:8000/api/v1/cameras/{zone_id}/stream?token={stream_token}"
```

### 3. View Stream in Browser

Navigate to:
```
http://localhost:3000/dashboard
```

Select a camera zone and verify:
- [ ] Video feed displays without buffering
- [ ] Bounding boxes appear around detected objects
- [ ] Detection labels visible (e.g., "drowning 0.92")
- [ ] Annotations update in real-time
- [ ] No flickering or annotation loss
- [ ] Stream framerate steady at ~30 FPS

### 4. Visual Inspection Checklist

**Good annotations:**
- ✓ Boxes stay on target as it moves
- ✓ Labels update immediately with new detections
- ✓ No ghost boxes from stale frames
- ✓ Confidence scores visible and realistic (0.8-0.99 range)
- ✓ Color coding correct (red for drowning, cyan for person)

**Bad annotations (if still broken):**
- ✗ No boxes at all (raw stream)
- ✗ Boxes appear then disappear (flickering)
- ✗ Boxes don't follow movement (stale)
- ✗ Boxes delayed by 100ms+ (temporal drift)

---

## Debugging Issues

### Issue: No Annotations on Stream

**Check 1: Is detection engine running?**
```bash
docker-compose logs detection_engine | head -30
```

Look for:
```
[zone_1] Pipeline started (3 workers)
[zone_1] Detection worker started
```

If not present, check why engine failed to start.

**Check 2: Is drain loop active?**
```bash
docker-compose logs detection_engine | grep "annotated drained"
```

Should show a log line every 10 seconds. If not, drain loop isn't running.

**Check 3: Are detections happening?**
```bash
docker-compose logs detection_engine | grep "detections="
```

Should show non-zero detection counts if objects are present.

**Check 4: Is frame writer updating?**
```bash
docker-compose logs detection_engine | grep "Frame write"
```

Should show steady writes. If not, frame writer may have crashed.

### Issue: Stream Drops Frames

**Symptoms:** Stuttering, pauses, or frame rate drops below 30 FPS

**Solution 1: Check CPU usage**
```bash
docker stats --no-stream aquaguard-detection_engine
```

If CPU > 95%, detection is overloaded. Consider:
- Reducing target frame rate
- Using model quantization
- Processing fewer detections

**Solution 2: Check disk I/O**
```bash
# Monitor JPEG write performance
watch -n 1 'find /snapshots/live -name "*.jpg" -mmin -1 | wc -l'
```

Should show new JPEGs every second. If stalled, disk I/O is bottleneck.

**Solution 3: Check memory**
```bash
docker inspect aquaguard-detection_engine | grep -i memory
```

Memory should be stable. If growing, possible memory leak.

### Issue: Temporal Drift (Old Annotations on New Scene)

**Symptoms:** Annotations lag behind moving objects by 100+ ms

This should NOT happen with the fix. If it does:

1. Verify drain loop is running (see above)
2. Check if detection speed changed:
   ```bash
   docker-compose logs detection_engine | grep "avg.*ms"
   ```
   Should be 60-100ms per frame. If >200ms, detection is slow.

3. Verify queue isn't full:
   ```bash
   docker-compose logs detection_engine | grep "drop_rate"
   ```
   Should be 0%. If not, frames are being dropped.

---

## Performance Benchmarks

**Expected metrics after fix:**

| Metric | Expected | Acceptable Range |
|--------|----------|------------------|
| MJPEG FPS | 30.0 | 29.5-30.5 |
| Detection FPS | 10-15 | 8-18 |
| Drain rate (frames/sec) | ~12 | 8-15 |
| Queue drop rate | 0% | <1% |
| Frame write latency | <1ms | <2ms |
| Detection latency | 60-100ms | 50-150ms |
| Annotation latency | 100-150ms | <200ms |
| CPU usage (per zone) | 30-50% | <80% |
| Memory per zone | 400-600MB | <1GB |

---

## Rollback Plan

If issues arise, rollback the fix:

```bash
# Revert to previous deployment
git checkout HEAD~1 -- detection_engine/pipeline/pipeline_manager.py

# Rebuild
docker-compose build detection_engine

# Redeploy
docker-compose up -d detection_engine
```

However, this will restore annotation loss. Do NOT use unless absolutely necessary.

---

## Success Criteria

The fix is successful when:

- [x] Docker images build without errors
- [x] Detection engine starts and stays running
- [x] Drain loop logs appear every 10 seconds
- [x] MJPEG stream accessible and shows bounding boxes
- [x] Annotations update in real-time
- [x] No visible flickering or jitter
- [x] Stream maintains 30 FPS steady
- [x] No annotation loss over 1+ hour runtime
- [x] All detection events logged correctly
- [x] Alerts triggered on schedule

## Support

For issues or questions:

1. Check logs first: `docker-compose logs -f`
2. Review this guide's debugging section
3. Verify code with: `verify_annotation_fix.bat`
4. Compare metrics to benchmarks table

---

Generated: 2024-04-29
Fix: AquaGuard Annotation Loss Fix v1.0
Status: Production Ready ✓
