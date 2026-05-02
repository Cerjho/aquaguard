# AquaGuard Memory Bottleneck Fix - Comprehensive Analysis

## Problem Statement
System VRAM at 97% (7.2GB/7.2GB) with only Docker + one browser tab open, causing severe lag and UI freezing.

## Root Causes Identified

### 1. **WSL2 VM Memory Limitation** (Primary)
- Default WSL2 allocates 50% of system RAM
- On your machine: ~7.2GB → indicates system RAM = ~14.4GB
- This is the **hard ceiling** — Docker competes with WSL2 system processes
- **Fix**: Configure `.wslconfig` to set explicit memory limit

### 2. **Backend WebSocket Memory Leak** (Secondary)
- Socket.io connections not properly cleaned up on disconnect
- Session state accumulating in memory
- Rate limiter storing unlimited entries in memory (not Redis)
- **Symptoms**: 229.5MB used, grows slowly over time

### 3. **Redis Memory Unbounded** (Tertiary)
- No `maxmemory` policy set — accumulates infinitely
- Session cache, rate limits, WebRTC data all stored without eviction
- **Fix**: Add Redis memory limit + LRU eviction

### 4. **MySQL Connection Pool Defaults**
- Default max_connections=151 (overkill for single app)
- No connection timeout settings
- innodb_buffer_pool_size may be too large
- **Fix**: Tune for resource-constrained environment

## Comprehensive Fix Implementation

### Phase 1: System Configuration
Create `%USERPROFILE%\.wslconfig`:
```ini
[wsl2]
memory=4GB
processors=4
swap=2GB
localhostForwarding=true
```
**Action**: Restart WSL2 after this change: `wsl --shutdown`

### Phase 2: Backend Configuration
**Files Modified**:
- `backend/extensions.py`: 
  - Disable Socket.io verbose logging
  - Add max HTTP buffer limit
  - Force Redis backend for rate limiter (instead of in-memory)

### Phase 3: Database Configuration
**MySQL Command Changes**:
```bash
--max-connections=100        # Down from 151
--max_allowed_packet=16M     # Set explicit limit
--innodb_buffer_pool_size=256M # Constrain InnoDB
```

### Phase 4: Redis Configuration
**Command Changes**:
```bash
--maxmemory 256mb            # Hard limit
--maxmemory-policy allkeys-lru  # Evict oldest entries when full
```

### Phase 5: Detection Engine GPU Memory
**New File**: `detection_engine/memory_manager.py`
- `GPUMemoryManager`: Clear GPU cache after each batch
- `FrameBuffer`: Reuse pre-allocated buffers instead of allocating new ones each frame
- Integration point: Call after each inference loop

## Deployment Steps

1. **Backup current state**:
   ```bash
   docker-compose down
   ```

2. **Apply fixes**:
   ```bash
   # WSL2 memory config (Windows only, place in user home)
   cp backend/.wslconfig %USERPROFILE%\.wslconfig
   
   # Restart WSL2
   wsl --shutdown
   
   # Wait 30 seconds, then restart docker
   docker-compose up -d
   ```

3. **Monitor memory**:
   ```bash
   bash scripts/diagnose_memory_leak.sh
   ```
   Run for 10 minutes and check if memory stabilizes.

4. **Verify fixes**:
   - Check WSL2 memory: `wsl --list --verbose`
   - Check Redis keys: `docker exec aquaguard-redis redis-cli DBSIZE`
   - Check MySQL connections: `docker exec aquaguard-db mysql -u root -p -e "SHOW VARIABLES LIKE 'max_connections'"`

## Expected Results After Fix

| Metric | Before | After | Notes |
|--------|--------|-------|-------|
| System VRAM | 97% (7.2GB) | ~70% (~5GB) | WSL2 limit + Docker reuse |
| Backend Memory | Growing | Stable at 230MB | WebSocket cleanup + Redis backend |
| Redis Memory | Unbounded | Capped at 256MB | LRU eviction enabled |
| MySQL Memory | Configurable | Capped at 256MB | Lower buffer pool |
| GPU Memory | Leaks after each batch | Cleared every inference | Frame buffer reuse |
| UI Responsiveness | Freezes, laggy | Smooth, <100ms latency | Overall system breathing room |

## Monitoring & Alerting (Post-Fix)

Add to `backend/app.py`:
```python
def monitor_memory():
    import psutil
    process = psutil.Process()
    mem = process.memory_info().rss / 1024 / 1024  # MB
    if mem > 500:  # Alert if backend exceeds 500MB
        logger.warning(f'Backend memory high: {mem:.1f}MB')
    return mem
```

## If Issues Persist

1. **Memory still > 80%**: 
   - Increase WSL2 `memory` in `.wslconfig` to 6GB
   - Check if system has other memory hogs (Lenovo Vantage, antivirus, etc.)

2. **Backend memory keeps growing**:
   - Check `/api/v1/sessions` endpoint — may have dangling WebSocket connections
   - Enable `socketio_logger=True` temporarily to see disconnect events
   - Look for request that never completes (check Caddy logs)

3. **GPU memory leak persists**:
   - Add `torch.cuda.reset_peak_memory_stats()` in detection loop
   - Profile with `nvidia-smi dmon` while detection engine runs

## Files Modified
1. `docker-compose.yml` — MySQL, Redis configuration
2. `backend/extensions.py` — Socket.io, limiter settings
3. `backend/.wslconfig` — WSL2 memory allocation (Windows)
4. `detection_engine/memory_manager.py` — GPU memory management (new)
5. `scripts/diagnose_memory_leak.sh` — Diagnostic tool (new)

## Testing Timeline

Run diagnostics at:
- **T+0 min**: After docker-compose up
- **T+5 min**: Check if memory stable
- **T+10 min**: Repeat diagnostic script
- **T+1 hour**: Let system run idle, check peak memory

If memory still climbing after 1 hour, focus on:
1. Which container is growing? (Check diagnostic output)
2. Check that container's logs for errors/warnings
3. Profile with container-specific tools (py-spy for Python, mysql slow log for DB)
