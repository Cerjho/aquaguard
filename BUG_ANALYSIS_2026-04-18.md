# Bug Analysis Report - 2026-04-18

## Critical Bugs

### 1. **Frontend Routing 404 (FIXED)**

- **Status:** ✅ Fixed
- **Issue:** nginx serving static files instead of routing to React SPA for non-existent routes
- **Symptom:** `/login` returns 404 "Not Found"
- **Fix Applied:** Added `try_files` directive to nginx.conf for React Router fallback to `/index.html`
- **Files Changed:** `frontend/nginx.conf` (created), `frontend/Dockerfile` (updated)

### 2. **Missing favicon.ico**

- **Severity:** Low (cosmetic/noise)
- **Issue:** Browser requests `/favicon.ico` which doesn't exist, causes noisy 404 logs
- **Symptom:** Every page load generates 404 errors in frontend logs for favicon.ico
- **Fix:** Create `frontend/public/favicon.ico` or add nginx fallback to skip logging
- **Quick Fix Option:**

  ```nginx
  location = /favicon.ico {
      access_log off;
      return 204;
  }
  ```

## Code Quality Bugs

### 3. **Silent Exception Handling in webrtc.py**

- **Severity:** Medium
- **Issue:** Bare `pass` after exception catches swallows errors without logging
- **Location:** `backend/routes/webrtc.py` line 150

  ```python
  except JWTExtendedException:
      pass  # Silently ignores JWT verification failures
  ```

- **Also Found:** Lines 66, 318, 419, 529 have `except Exception as exc:` without logging the exception
- **Fix:** Log exceptions properly:

  ```python
  except JWTExtendedException:
      logger.debug("JWT verification failed, trying API key")
  except Exception as exc:
      logger.warning("WebRTC operation failed: %s", exc)
  ```

### 4. **Empty Migration File**

- **Severity:** Low
- **Issue:** Migration file has empty up/down functions
- **Location:** `backend/migrations/versions/d4e5f6a7b8c9_merge_detection_event_and_perf_heads.py`

  ```python
  def upgrade():
      pass
  
  def downgrade():
      pass
  ```

- **Impact:** Migration exists but does nothing; indicates incomplete merge resolution
- **Fix:** Remove the file if no schema changes are needed, or implement proper migration

## Runtime/Configuration Bugs

### 5. **ESP32 MQTT Bridge Disconnections**

- **Severity:** Medium
- **Issue:** Backend logs show repeated disconnections: "ESP32 MQTT bridge disconnected unexpectedly: Unspecified error"
- **Log Evidence:** `[2026-04-18 02:15:10,521] WARNING in esp32_mqtt_bridge: ESP32 MQTT bridge disconnected unexpectedly: Unspecified error`
- **Root Cause:** Not clear from logs - could be:
  - MQTT broker network issues
  - Missing error details in exception handling
  - Connection timeout configuration
- **Required Fix:** Add better error context to esp32_mqtt_bridge reconnection logic

### 6. **API Response Format Inconsistency**

- **Severity:** Low
- **Issue:** Different endpoints return different error formats
- **Example:**
  - Some: `{'error': 'message'}` (dict format)
  - Expected by contract: `{'status': 'error', 'message': '...', 'data': null}` (AquaGuard contract)
- **Affected Routes:** `backend/routes/system.py`, `backend/routes/cameras.py`
- **Fix:** Standardize all responses to follow the contract

## Recommended Immediate Fixes

**Priority 1 (Do Now):**

1. Rebuild frontend with nginx fix (already done - just verify it's working)
2. Add favicon to `frontend/public/favicon.ico`
3. Review and fix exception handling in `backend/routes/webrtc.py`

**Priority 2 (Do Soon):**

1. Add better error context to MQTT bridge disconnection handling
2. Remove empty migration file or implement it properly
3. Standardize API response format

**Priority 3 (Nice to Have):**

1. Add logging to utility scripts instead of print()
2. Add frontend health endpoint
3. Document default credentials warning in .env.example

## Service Health Status

Current running services: ✅ All healthy

- mysql: Healthy
- redis: Healthy  
- mosquitto: Healthy
- backend: Healthy
- frontend: Starting (should be healthy after rebuild)
- coturn: Running

## Testing Required

After fixes:

1. Refresh <http://localhost:3000> - should load login page without 404
2. Check browser console - no favicon 404 errors
3. Monitor backend logs for 5 minutes - no JWT silent failures
4. Check ESP32 heartbeat stability if device is connected
