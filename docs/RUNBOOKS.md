# AquaGuard Production Runbooks

This document contains operational procedures for responding to production incidents and maintaining the AquaGuard system.

## 1. Stuck Camera Feed or Pipeline Deadlock

**Symptom**: A camera feed in the dashboard shows a stale image, the `fps_actual` drops to 0, or WebRTC falls back to MJPEG and freezes.
**Root Cause**: The detection engine pipeline worker has deadlocked, or the RTSP stream from the physical camera has silently failed without closing the TCP connection.

**Resolution Steps**:
1. Verify if the issue is the physical camera: 
   - Check the `camera_zones` table for the `rtsp_url`.
   - Attempt to connect to the RTSP stream using VLC or `ffplay`.
2. If the stream is active but AquaGuard is stuck, restart the Detection Engine:
   ```bash
   docker compose restart detection_engine
   ```
3. If the backend is under memory pressure or WebRTC is stuck:
   ```bash
   docker compose restart backend
   ```
4. Verify recovery by checking the `/api/v1/system/status` endpoint.

## 2. Tuning Detection Confidence Thresholds

**Symptom**: Too many false positive alerts, or missed drowning events.
**Root Cause**: YOLO/MediaPipe confidence thresholds are misaligned with the specific environment (lighting, angle, glare).

**Resolution Steps**:
1. Open `config/settings.py` on the host machine.
2. Adjust the following rolling-window thresholds:
   - `CONFIDENCE_WINDOW_SIZE` (default: 15) - Increase to smooth out flickering detections.
   - `CONFIDENCE_THRESHOLD` (default: 0.75) - Increase to require higher certainty before alerting.
   - `CONFIDENCE_MIN_HITS` (default: 10) - Increase to require the behavior to persist longer.
3. Restart the Detection Engine container to apply changes:
   ```bash
   docker compose restart detection_engine
   ```

## 3. Managing Default Users & Passwords

**Symptom**: Need to rotate the admin password or a lifeguard account is locked out.
**Root Cause**: Routine security rotation or forgotten credentials.

**Resolution Steps**:
To securely rotate passwords without exposing them in shell history:
1. Shell into the backend container:
   ```bash
   docker exec -it aquaguard-backend /bin/bash
   ```
2. Activate the virtual environment (if applicable) and run the reset script:
   ```bash
   python reset_admin_password.py --username admin --new-password <SECURE_PASSWORD>
   ```
3. If the user was deactivated, use the database CLI to reactivate them:
   ```bash
   mysql -u aquaguard -paquaguardpass aquaguard -e "UPDATE users SET is_active=1 WHERE username='admin';"
   ```

## 4. Recovering from Redis Rate Limit Lockout

**Symptom**: Valid traffic is returning `HTTP 429 Too Many Requests`.
**Root Cause**: Redis memory limits reached or a sudden burst triggered aggressive blocklisting.

**Resolution Steps**:
1. Check Redis memory usage:
   ```bash
   docker exec -it aquaguard-redis redis-cli info memory
   ```
2. To flush all rate limits instantly (Warning: This also clears the JWT token blocklist!):
   ```bash
   docker exec -it aquaguard-redis redis-cli FLUSHDB
   ```

## 5. Investigating Backend Database Bloat

**Symptom**: Database queries are slow, or disk space on the `mysql_data` volume is critically low.
**Root Cause**: The `DetectionEvent` table has grown unbounded.

**Resolution Steps**:
1. Run the cleanup script (if implemented) or manually prune old events:
   ```sql
   DELETE FROM detection_events WHERE detected_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
   ```
   *(Note: The `SystemLog` table was removed in v1.1.0 to prevent bloat. Rely on Docker container logs instead.)*
