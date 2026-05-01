# Deployment Guide

## Pre-Deployment Checklist

- [ ] Read `README.md` for overview
- [ ] Review all 4 fix documents (FIX_*.md)
- [ ] All tests passing locally
- [ ] Docker Compose validation passing
- [ ] Backup current deployment config

## Files to Deploy

### Code Changes (4 files)
1. `detection_engine/pipeline/detection_worker.py` — ThreadPoolExecutor parallelization
2. `detection_engine/vision/pose_estimator.py` — MediaPipe reset threshold
3. `detection_engine/camera/frame_writer.py` — Pre-allocated buffers + race condition fix
4. `docker-compose.yml` — Resource limits added

### Tests Added (3 files)
5. `detection_engine/tests/test_detection_worker_parallelism.py`
6. `detection_engine/tests/test_pose_estimator_memory_reset.py`
7. `detection_engine/tests/test_frame_writer_race_condition.py`

### Scripts Added (1 file)
8. `scripts/test_docker_limits.sh`

## Deployment Steps

### 1. Backup Current State
```bash
# Backup docker-compose.yml
cp docker-compose.yml docker-compose.yml.backup

# Backup detection engine code
cp -r detection_engine detection_engine.backup
```

### 2. Verify New Files
```bash
# Check all 4 code files exist
ls -la detection_engine/pipeline/detection_worker.py
ls -la detection_engine/vision/pose_estimator.py
ls -la detection_engine/camera/frame_writer.py
ls -la docker-compose.yml

# Check test files exist
ls -la detection_engine/tests/test_detection_worker_parallelism.py
ls -la detection_engine/tests/test_pose_estimator_memory_reset.py
ls -la detection_engine/tests/test_frame_writer_race_condition.py

# Check validation script exists
ls -la scripts/test_docker_limits.sh
```

### 3. Run Local Tests (Before Deploying)
```bash
cd detection_engine

# Fix #1 tests
pytest tests/test_detection_worker_parallelism.py -v

# Fix #2 tests
pytest tests/test_pose_estimator_memory_reset.py -v

# Fix #4 tests
pytest tests/test_frame_writer_race_condition.py -v

# All existing tests (must still pass)
pytest tests/ -v
```

### 4. Validate Docker Configuration
```bash
# Validate resource limits
bash scripts/test_docker_limits.sh

# Expected: All checks pass, exit code 0
```

### 5. Stop Current System
```bash
docker-compose down

# Verify all containers stopped
docker ps
# Expected: No aquaguard containers running
```

### 6. Deploy New Code
```bash
# Docker will rebuild detection_engine image with new code
docker-compose up -d

# Wait for containers to start
sleep 10

# Verify containers are running
docker ps | grep aquaguard
```

### 7. Verify Startup
```bash
# Check detection engine is running
docker-compose logs aquaguard-detection | tail -20

# Look for:
# - "Detection worker started (pose_analysis_workers=2)"
# - "Continuous frame writer started ... (FIX #4: pre-allocated buffers)"

# Check for any errors
docker-compose logs aquaguard-detection | grep -i error
# Expected: No errors
```

### 8. Monitor During First Run
```bash
# Watch logs in real-time
docker-compose logs -f aquaguard-detection

# Expected signatures:
# - Stable camera/detection FPS
# - MediaPipe flush messages every ~8 min
# - No error messages

# In another terminal, monitor container stats
docker stats aquaguard-mysql aquaguard-redis aquaguard-backend aquaguard-detection
# Expected: Each stays under its memory limit
```

## Rollback Plan (If Needed)

### Immediate Rollback
```bash
docker-compose down

# Restore from backup
cp docker-compose.yml.backup docker-compose.yml
cp -r detection_engine.backup/* detection_engine/

# Restart
docker-compose up -d
```

### Verify Rollback
```bash
# Check old code is running
docker-compose logs aquaguard-detection | grep -i "worker started"

# Should NOT mention "pose_analysis_workers=2"
```

## Staging Deployment (Recommended)

Before production, deploy to staging environment first:

```bash
# Create staging compose file
cp docker-compose.yml docker-compose.staging.yml

# Edit staging file: change image tags to "staging"
# Edit staging file: change port mappings
# Edit staging file: change container names

# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d

# Run tests on staging
pytest detection_engine/tests/ -v

# Monitor for 24+ hours
watch -n 60 'docker stats --no-stream'
```

After staging validation, proceed with production deployment.

## Post-Deployment Verification

### Immediate (First 30 minutes)
- [ ] All containers running: `docker ps`
- [ ] No error messages: `docker-compose logs | grep -i error`
- [ ] Camera FPS stable 15+ FPS
- [ ] Detection FPS stable 10-15 FPS
- [ ] Drop rate <5%

### Short-term (24 hours)
- [ ] System running continuously
- [ ] No unexpected container restarts
- [ ] Memory usage stable
- [ ] All tests still passing

### Long-term (7+ days)
- [ ] System ran indefinitely (not just 7 min)
- [ ] Memory usage didn't grow monotonically
- [ ] FPS remained stable throughout
- [ ] No alerts or degradation

## Monitoring Setup

### Essential Metrics to Watch
```bash
# In Grafana or equivalent:
- aquaguard_camera_fps
- aquaguard_detection_fps
- aquaguard_frame_drop_rate
- aquaguard_memory_usage
- aquaguard_container_health
```

### Log Monitoring
```bash
# Watch for these patterns:
docker-compose logs --tail=100 aquaguard-detection | grep -E "(Error|Failed|timeout|restart)"

# Expected: Minimal errors, no constant restarts
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs aquaguard-detection

# Common issues:
# - Memory reservation too high: reduce in docker-compose.yml
# - Port already in use: check `lsof -i :5000`
# - Image build failed: `docker-compose build --no-cache`
```

### High memory usage
```bash
# Check which container is using memory
docker stats --no-stream

# If detection_engine: might have a leak (run tests)
# If other service: hitting limit (increase limit)
```

### FPS not stable
```bash
# Check logs for GIL issues
docker-compose logs aquaguard-detection | grep -i "throttle\|timeout\|stall"

# Check resource limits are applied
docker inspect aquaguard-detection | grep -A 5 Memory

# Run Fix #1 tests to verify parallelism working
pytest detection_engine/tests/test_detection_worker_parallelism.py -v
```

### Memory growth over time
```bash
# Check for page faults
vmstat 1 5 | tail -2

# Check MediaPipe reset messages
docker-compose logs aquaguard-detection | grep "Flushing MediaPipe"

# Expected: Reset every 8-10 minutes
```

## Production Deployment Checklist

- [ ] Backed up all config
- [ ] Tested locally (all tests passing)
- [ ] Tested on staging (24+ hours stable)
- [ ] Docker limits validated
- [ ] Monitoring setup ready
- [ ] Rollback plan documented
- [ ] Team informed of deployment
- [ ] Maintenance window scheduled
- [ ] Post-deployment verification plan ready

## Deployment Window

**Recommended timing**:
- Not during peak usage hours
- When support team is available
- With monitoring actively watched
- Plan 30-60 minutes for deployment + verification

**Expected downtime**: 5-10 minutes (docker-compose restart)

