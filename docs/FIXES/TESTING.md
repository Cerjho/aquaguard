# Testing Guide

## Quick Start

```bash
cd detection_engine

# Run all new tests for the 4 fixes
pytest tests/test_detection_worker_parallelism.py -v
pytest tests/test_pose_estimator_memory_reset.py -v
pytest tests/test_frame_writer_race_condition.py -v

# Validate Docker limits
bash ../../scripts/test_docker_limits.sh

# Run full test suite (all tests must pass)
pytest tests/ -v
```

## Test Overview

### Fix #1: GIL Contention (5 tests)
**File**: `detection_engine/tests/test_detection_worker_parallelism.py`

Tests verify ThreadPoolExecutor parallelization is working:
- ThreadPoolExecutor created with 2 workers
- Parallelism reduces wall-clock time (<100ms vs 150ms sequential)
- Results collected correctly from thread pool
- Timeout handling (5s limit doesn't crash)
- Executor properly shutdown on stop

**Run**:
```bash
pytest tests/test_detection_worker_parallelism.py -v
```

**Success criteria**:
- All 5 tests pass ✅
- Wall-clock time <100ms for 3 detections
- No hanging threads

### Fix #2: MediaPipe Reset (4 tests)
**File**: `detection_engine/tests/test_pose_estimator_memory_reset.py`

Tests verify MediaPipe reset threshold and memory cleanup:
- Threshold is 5,000 (not 100,000)
- New pose runner created after reset
- Exception handling (close() failures don't crash)
- Logging includes frame count and timing info

**Run**:
```bash
pytest tests/test_pose_estimator_memory_reset.py -v
```

**Success criteria**:
- All 4 tests pass ✅
- Frame count reset to 0 after threshold
- Log messages contain "5000" and "8.3"

### Fix #3: Docker Limits (No unit tests)
**File**: `scripts/test_docker_limits.sh`

Script validates resource limits in docker-compose.yml:
- MySQL: 1024M limit, 512M reservation
- Redis: 256M limit, 128M reservation
- Mosquitto: 128M limit, 64M reservation
- Coturn: 512M limit, 256M reservation
- Backend: 1024M limit, 512M reservation
- Frontend: 256M limit, 128M reservation
- Detection: 4096M limit

**Run**:
```bash
bash scripts/test_docker_limits.sh
```

**Success criteria**:
- Exit code 0 ✅
- All checks pass (green OK)
- No FAIL messages

### Fix #4: Frame Buffer Race Condition (15 tests)
**File**: `detection_engine/tests/test_frame_writer_race_condition.py`

**CRITICAL TEST**: Race condition verification
- Pre-allocation: buffers allocated at init, reused
- Race condition: concurrent updates/reads produce no tearing
- Buffer ownership: stored frame unchanged after input modification
- Thread safety: lock prevents interleaving

**Run**:
```bash
pytest tests/test_frame_writer_race_condition.py -v
```

**Success criteria**:
- All 15 tests pass ✅
- No frame tearing detected (concurrent stress test)
- `np.copyto` called (not `frame.copy()`)

## Full Test Suite

Run all tests to ensure no regressions:

```bash
cd detection_engine
pytest tests/ -v
```

Expected:
- ~85 total tests (original ~60 + new 24)
- All passing ✅

## Test Patterns

### Timing-Based Tests (Fix #1)
These measure wall-clock time to verify parallelism:

```python
# Concurrent execution: 3 detections × 50ms each, 2 workers
# Sequential would be: 3 × 50ms = 150ms
# Parallel should be: ~50-60ms

start = time.time()
worker._process_frame(frame_data)
elapsed = time.time() - start

assert elapsed < 100, f"Parallelism not working ({elapsed}ms)"
```

### Race Condition Tests (Fix #4)
These use threading to stress concurrent access:

```python
# Thread 1: Updates buffer 100 times
# Thread 2: Reads buffer and checks for mixed values

# Expected: All reads see uniform value (no tearing)
# Failure: Some reads see 0, 100, 200 mixed (tearing detected)
```

### Mock-Based Tests (All)
These mock dependencies to test in isolation:

```python
with patch("numpy.copyto") as mock_copyto:
    writer.update_raw_frame(frame)
    mock_copyto.assert_called_once()  # Verify np.copyto was called
```

## Running Tests in CI/CD

### GitHub Actions Example
```yaml
name: Test Fixes

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      
      - name: Install dependencies
        run: |
          cd detection_engine
          pip install -r requirements.txt pytest
      
      - name: Run tests
        run: |
          cd detection_engine
          pytest tests/ -v --tb=short
      
      - name: Validate Docker limits
        run: bash scripts/test_docker_limits.sh
```

## Test Execution Timing

| Test Suite | Tests | Time | Notes |
|-----------|-------|------|-------|
| Fix #1 (Parallelism) | 5 | ~2 sec | Includes timing-based test |
| Fix #2 (MediaPipe) | 4 | ~1 sec | Mocked, fast |
| Fix #4 (Race) | 15 | ~5 sec | Concurrent stress test |
| Docker Limits | 1 | ~1 sec | Script validation |
| **Total New** | **25** | **~9 sec** | Fast, can run frequently |
| Existing Tests | ~60 | ~30 sec | Original test suite |
| **All Tests** | **~85** | **~40 sec** | Full validation |

## Debugging Tests

### If test fails: Get verbose output
```bash
pytest tests/test_detection_worker_parallelism.py::test_multiple_detections_analyzed_concurrently -vv -s
```

Flags:
- `-vv` — Very verbose output
- `-s` — Show print() statements
- `::` — Run specific test

### If timing-based test flaky: Adjust tolerance
```python
# In test file, adjust assertion:
assert elapsed < 120, f"Expected <100ms, got {elapsed}ms"  # 20ms wiggle room
```

### If race condition test doesn't trigger: Add more threads
```python
# In test file, increase iterations:
for i in range(100):  # Was 10
    # ...
```

## Pre-Deployment Test Checklist

Before deploying to production:

```bash
# 1. Run all new tests
pytest detection_engine/tests/test_detection_worker_parallelism.py -v
pytest detection_engine/tests/test_pose_estimator_memory_reset.py -v
pytest detection_engine/tests/test_frame_writer_race_condition.py -v

# 2. Run all existing tests (ensure no regressions)
pytest detection_engine/tests/ -v

# 3. Validate Docker configuration
bash scripts/test_docker_limits.sh

# 4. Build Docker image
docker-compose build

# 5. Spin up in test environment
docker-compose up -d

# 6. Monitor for 30 minutes
docker-compose logs -f aquaguard-detection

# 7. Verify metrics
# - Camera FPS: 15+ and stable
# - Detection FPS: 10-15 and stable
# - Drop rate: <5%
# - No error messages
```

## Known Issues & Workarounds

### Test hangs on concurrent.futures.TimeoutError
**Cause**: Thread pool timeout in test
**Fix**: Increase timeout in test or skip on CI with `-k "not timeout"`

### Docker limits script fails on docker-compose config
**Cause**: Docker not running or compose file has errors
**Fix**: Run `docker-compose config` manually to debug

### Race condition test fails intermittently
**Cause**: System under load, timing varies
**Fix**: Run multiple times or increase iterations in test

## Performance Expectations

After fixes, test suite should:
- ✅ Run in <1 minute on modern laptop
- ✅ No hanging or timeouts
- ✅ All tests pass on first run (deterministic)
- ✅ Memory usage stable during test run

## Continuous Testing

### Recommended Setup
```bash
# Run on every commit
cd detection_engine
pytest tests/test_detection_worker_parallelism.py -q
pytest tests/test_pose_estimator_memory_reset.py -q
pytest tests/test_frame_writer_race_condition.py -q

# Run full suite daily
pytest tests/ -v
```

### Monitoring
- Alert if any test fails
- Alert if test suite takes >2 minutes
- Alert if Docker limits validation fails

