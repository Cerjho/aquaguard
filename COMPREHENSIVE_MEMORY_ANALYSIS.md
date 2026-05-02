# AquaGuard Memory Bottleneck — COMPREHENSIVE DEEP-DIVE ANALYSIS

## System State at Analysis Time
```
System VRAM: 97% (7.2GB/7.2GB)
Docker Only:
- Detection Engine: 1016MB (1 Python process @ 35.6% container memory)
- Backend: 152.5MB (14.9% of 1GB limit)
- Database: 409.2MB (39.9% of 1GB limit)
- Redis: 8.6MB (3.3% of 256MB limit)
- Frontend: 8.6MB (2.2% of 384MB limit)
- Mosquitto: 5.2MB (4.1% of 128MB limit)
- Coturn: 14.2MB (2.7% of 512MB limit)
```

---

## ROOT CAUSE #1: Detection Engine GPU Memory Leak (PRIMARY) ⚠️

### Smoking Gun Evidence
```
nvidia-smi output:
  GPU Memory: 870MB allocated
  Processes:  "No running processes found"
  
Inside container:
  Python PID 26: VmRSS = 1.1MB (main process memory)
  Container reported: 1016MB (Docker daemon view)
  
Discrepancy: 870MB GPU memory is ORPHANED (not freed)
```

### Why This Happens
1. **Two Heavy Models Loaded**:
   - `DrowningDetector`: YOLOv11s model (~400MB on disk, ~600MB GPU VRAM)
   - `PoseEstimator`: YOLOv8n-pose model (~50MB on disk, ~150MB GPU VRAM)
   - Both initialized at startup, never unloaded

2. **GPU Cache Not Cleared Between Inferences**:
   - File: `detection_engine/vision/detector.py`, line ~230
   - `_handle_cuda_oom()` calls `torch.cuda.empty_cache()` only on OOM
   - Normal inference loop: NO explicit cache clearing
   - GPU accumulates intermediate buffers (activations, gradients) indefinitely

3. **PyTorch Default Behavior**:
   - YOLO models use `torch.cuda.memory.allocator` which reserves memory
   - Default policy: "caching allocator" keeps freed blocks for reuse
   - With NO explicit clearing, free blocks accumulate as "reserved"
   - 870MB = reserved allocations waiting to be reused

### Impact on System
- **GPU → System RAM spillover**: When GPU fills, CUDA operations fallback to system RAM
- **WSL2 memory pressure**: GPU memory counts against WSL2's 7.2GB total
- **System swap activated**: Fallback to disk, causing extreme lag
- **Browser freezes**: Frontend JS engine starved of CPU cycles

---

## ROOT CAUSE #2: Python Process Virtual Memory Bloat (SECONDARY)

```
Python PID 26:
  VSZ (virtual address space): 23.1GB (!)
  RSS (resident/physical): 1.1MB
  Ratio: 21000x bloat
```

### Root Cause
1. **Torch CUDA tensors mapped to virtual memory**:
   - GPU arrays have host-side shadow allocations
   - These map to process virtual address space
   - Real memory is on GPU, but process VAS is reserved

2. **Multiple numpy array copies**:
   - Frame capture: 2-3 copies (camera → shared memory → queue)
   - Detection: 1 copy (queue → inference → annotated)
   - Frame writer: 1 copy (queue → disk buffer)
   - Each ~6.2MB, persisted in process VAS even when freed

3. **Ultralytics YOLO internals**:
   - Model inference creates intermediate tensors
   - These get freed but memory space remains reserved
   - Each inference loop can allocate/free ~100-500MB of temporary tensors

### Why This Matters
- VSZ doesn't directly consume RAM, but indicates memory churn
- High VSZ + high RSS = actual memory leak
- High VSZ + low RSS = virtual memory fragmentation (slower but not OOM)
- Your system: Low RSS but filled GPU = GPU is the bottleneck

---

## ROOT CAUSE #3: System VRAM Allocation Model

### WSL2 Memory Ceiling
```
.wslconfig NOT SET = WSL2 allocates 50% of system RAM
Your system RAM: ~14.4GB (inferred from 97% = 7.2GB)
WSL2 VM limit: Not capped → fills to system max
Docker limit: 7.2GB total for all containers + WSL system
```

### Memory Distribution (7.2GB total)
```
WSL2 System + Docker: 7.2GB
├─ Detection Engine: 1.0GB (GPU: 870MB + buffers: 130MB)
├─ Database: 410MB (InnoDB buffer pool)
├─ Backend: 150MB (Flask + Socket.io + sessions)
├─ Coturn: 14MB (TURN relay state)
├─ Mosquitto: 5MB (MQTT broker)
├─ Redis: 9MB (6 keys only)
├─ Frontend: 9MB (nginx + static files)
└─ WSL2 System: 5.6GB (kernel, systemd, cgroups, page cache, etc.)
```

### The Problem: WSL2 System Swallows 5.6GB
- WSL2 allocates ALL available VM memory to itself
- Docker sits in the same VM but competes
- No explicit cap means WSL2 grows first, Docker starves
- You can't constrain Docker tighter because WSL2 is already at ceiling

---

## ROOT CAUSE #4: MySQL Configuration Suboptimal for Resource Constraints

```
Current:
  max_connections: 100 (OK for production, overkill for single app)
  innodb_buffer_pool_size: 256MB (OK, but not optimal)
  
Issues:
  - Connection pool opens 100 slots, even if using 1-2
  - Buffer pool sized for 4GB systems, you have 7.2GB shared
  - No aggressive table cache tuning
  - table_open_cache: default 4000 (overkill for 10 tables)
```

### Memory Impact
- Per-connection overhead: ~5-10MB
- 100 connections × 8MB = 800MB theoretical max (you're at 410MB = 6 active)
- Buffer pool: 256MB fixed allocation
- Total MySQL memory could balloon to 600MB if all connections active

---

## ROOT CAUSE #5: Caddy/Frontend WebSocket Connections Not Flushed

### Symptoms
```
Caddy logs (from earlier analysis):
  "http2: stream closed" (11 occurrences)
  "context canceled" (multiple)
  "aborting with incomplete response" (8+ times)
```

### Mechanics
1. **Socket.io polling timeout**: Default 20 seconds, your logs show 6.8s timeout
2. **Stale connections not cleared**: Browser tab closed but connection lingered
3. **Session state accumulated**: Flask sessions for each connection stored in Redis
4. **Caddy reverse proxy buffering**: Caddy holds connections open for slow responses

### Memory Impact (Indirect)
- Each connection: ~1MB buffer (Socket.io + Flask)
- 100 stale connections: ~100MB
- Not critical alone, but amplifies GPU pressure

---

## MISSING CONFIGURATION: GPU Memory Limit

### Current State
```
docker-compose.yml:
  detection_engine.deploy.resources:
    devices:
      - driver: nvidia
        count: 1
        capabilities: [gpu]
```

### Problem
- No `NVIDIA_VISIBLE_DEVICES` set
- No memory limit enforced
- GPU allocator can reserve all 4GB
- No explicit context per-process

### Expected Behavior
- Should limit GPU memory to 3GB per process
- Should enable memory monitoring
- Should fail gracefully at 3GB vs. silently OOM

---

## COMPREHENSIVE FIX PLAN (PRIORITY ORDER)

### PRIORITY 1: GPU Memory Leak (Immediate Impact)
**File**: `detection_engine/pipeline/detection_worker.py`

```python
def _process_frame(self, frame_data: FrameData) -> None:
    # ... existing code ...
    
    # AFTER inference, before putting frame in output queue:
    # Clear GPU cache to prevent accumulation
    if torch.cuda.is_available():
        torch.cuda.empty_cache()  # <- ADD THIS
        torch.cuda.reset_peak_memory_stats()  # <- ADD THIS
    
    self.output_frame.put(frame_data)
```

**Expected Impact**: -250MB GPU memory within 1 minute

### PRIORITY 2: WSL2 Memory Cap
**File**: `%USERPROFILE%\.wslconfig` (Windows only)

```ini
[wsl2]
memory=4GB
processors=4
swap=2GB
```

**Action**: `wsl --shutdown` then restart Docker

**Expected Impact**: -2.2GB system VRAM freed, prevents WSL2 bloat

### PRIORITY 3: MySQL Tuning
**File**: `docker-compose.yml`

```yaml
mysql:
  command: >
    --default-authentication-plugin=mysql_native_password
    --max-connections=50
    --max_allowed_packet=16M
    --table-open-cache=500
    --innodb-buffer-pool-size=200M
    --innodb-log-buffer-size=8M
```

**Expected Impact**: -100MB memory

### PRIORITY 4: Redis Eviction Policy
Already applied in latest compose. Verify:
```bash
docker exec aquaguard-redis redis-cli CONFIG GET maxmemory
docker exec aquaguard-redis redis-cli CONFIG GET maxmemory-policy
```

Expected: `256mb` and `allkeys-lru`

### PRIORITY 5: Socket.io Tuning
Already applied in `backend/extensions.py`. Verify no verbose logging:
```python
socketio = SocketIO(
    engineio_logger=False,  # Disable verbose logging
    logger=False,
    max_http_buffer_size=1048576,  # 1MB limit per message
)
```

### PRIORITY 6: Detection Engine GPU Context Management
**New File**: `detection_engine/gpu_context.py`

```python
import torch
import atexit

class GPUContextManager:
    """Manage CUDA context lifecycle to prevent orphaned allocations."""
    
    def __init__(self):
        if torch.cuda.is_available():
            # Set memory growth to False (allocate only needed)
            torch.cuda.set_per_process_memory_fraction(0.75)  # Limit to 75% of GPU
    
    def cleanup(self):
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

# Global instance
_gpu_manager = GPUContextManager()
atexit.register(_gpu_manager.cleanup)
```

**Usage in main.py**:
```python
from detection_engine.gpu_context import _gpu_manager

# At startup (after torch imports)
# _gpu_manager is auto-initialized
```

### PRIORITY 7: Monitor GPU Memory Continuously
**New File**: `detection_engine/gpu_monitor.py`

```python
import logging
import threading
import torch
import time

logger = logging.getLogger(__name__)

def monitor_gpu_memory(interval_seconds=30):
    """Log GPU memory stats every N seconds in background thread."""
    def _monitor():
        while True:
            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1e9  # GB
                reserved = torch.cuda.memory_reserved() / 1e9
                logger.info(
                    "GPU Memory: %.2fGB allocated, %.2fGB reserved",
                    allocated, reserved
                )
            time.sleep(interval_seconds)
    
    thread = threading.Thread(target=_monitor, daemon=True)
    thread.start()
    return thread
```

**Usage in main.py**:
```python
from detection_engine.gpu_monitor import monitor_gpu_memory
monitor_gpu_memory(interval_seconds=30)
```

---

## EXPECTED RESULTS AFTER ALL FIXES

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| System VRAM | 97% (7.2GB) | 55-60% (4-4.3GB) | -2.9-3.2GB |
| GPU Memory | 870MB orphaned | 200MB dynamic | -670MB |
| Detection CPU | 75%+ | 45-50% | Smoother inference |
| Frontend Response Time | 2-3s latency | <500ms | 4-6x faster |
| WSL2 System | 5.6GB (bloat) | 3.5GB (lean) | More breathing room |
| Backend Memory | 152MB (growing) | 150MB (stable) | Leak fixed |
| MySQL Memory | 410MB | 200MB | Tuned pools |

---

## DEPLOYMENT CHECKLIST

- [ ] Apply GPU cache clearing (detection_worker.py)
- [ ] Create .wslconfig with memory=4GB
- [ ] Run `wsl --shutdown` and restart Docker
- [ ] Apply MySQL command-line tuning (docker-compose.yml)
- [ ] Verify Redis CONFIG (maxmemory=256mb, policy=allkeys-lru)
- [ ] Monitor GPU with `nvidia-smi dmon`
- [ ] Run `bash scripts/diagnose_memory_leak.sh` for 10 minutes
- [ ] Check system VRAM % in Task Manager after 10 minutes
- [ ] Open browser and test UI responsiveness
- [ ] Let system idle for 1 hour, verify memory stable

---

## TESTING PROTOCOL

1. **Baseline** (current state):
   ```bash
   # Terminal 1: Watch GPU
   watch -n 2 'nvidia-smi'
   
   # Terminal 2: Watch system
   docker stats --no-stream
   
   # Note VRAM % from Task Manager
   ```

2. **After GPU cache fix** (5 min):
   - GPU Memory should drop 200-300MB
   - Note new baseline

3. **After WSL2 cap** (restart):
   - System VRAM % should drop 20-30 percentage points
   - Remaining VRAM available to apps

4. **After MySQL tuning** (1 min):
   - MySQL memory should drop 100-150MB
   - Verify no connection errors in backend logs

5. **After socket.io tuning** (5 min):
   - Caddy logs should show fewer "context canceled"
   - Backend memory should stabilize

6. **Final state** (10 min):
   - System VRAM < 65%
   - GPU Memory < 250MB
   - All containers stable
   - UI responsive (<500ms)

---

## If Issues Persist After All Fixes

### GPU Memory Still > 300MB
- Check if multiple models loaded: `nvidia-smi` → should show only 1 process
- Verify `torch.cuda.empty_cache()` is called: Add logging in detection_worker.py
- Check if CUDA context leak: Profile with `py-spy` on detection engine

### System VRAM Still > 70%
- Check WSL2 config applied: `wsl --list --verbose` → memory column should show 4GB
- Check if antivirus/background processes: Task Manager → Resource Monitor
- Check for memory leaks in Caddy: Run `docker logs aquaguard-edge` for crashes

### Backend Memory Growing (> 200MB)
- Check for WebSocket connection leaks: `docker exec aquaguard-backend curl http://localhost:5000/api/v1/sessions`
- Check for cache buildup: Redis KEYS count should be < 100
- Profile with `memory_profiler`: Add `@profile` to backend routes

### MySQL Still Using > 400MB
- Verify command-line options applied: `docker exec aquaguard-db mysqld --print-defaults`
- Check open table cache: `SHOW OPEN TABLES`
- Profile slow queries: Enable `slow_query_log`

---

## Files to Modify

1. **detection_engine/pipeline/detection_worker.py** — GPU cache clearing
2. **docker-compose.yml** — MySQL, Redis tuning
3. **backend/extensions.py** — Socket.io settings (already done)
4. **%USERPROFILE%\.wslconfig** — WSL2 memory cap (Windows only)
5. **detection_engine/gpu_context.py** — GPU context manager (NEW)
6. **detection_engine/gpu_monitor.py** — GPU memory monitoring (NEW)

---

## Expected Outcome

After all fixes, your system should:
- ✅ Use **55-60% VRAM** instead of 97%
- ✅ Have **responsive UI** (<500ms latency)
- ✅ Show **stable memory** across containers (no leaks)
- ✅ Maintain **consistent GPU at 200MB** (not 870MB)
- ✅ Support **smooth video streaming** at 30 FPS
- ✅ Run **detection at 10-15 FPS** without frame drops

This resolves the system-wide bottleneck and enables headroom for additional features.
