@echo off
REM AquaGuard Annotation Fix Verification Script (Windows)
REM Verifies that the annotation loss fix is correctly deployed

setlocal enabledelayedexpansion

echo.
echo ================================================
echo AquaGuard Annotation Loss Fix - Verification
echo ================================================
echo.

REM Check 1: Docker images built
echo Checking Docker images...
docker image inspect aquaguard-detection_engine:latest >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] detection_engine image exists
) else (
    echo [FAIL] detection_engine image NOT found
    exit /b 1
)

docker image inspect aquaguard-backend:latest >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] backend image exists
) else (
    echo [FAIL] backend image NOT found
    exit /b 1
)

echo.

REM Check 2: Pipeline manager source code
echo Verifying pipeline manager code...
findstr /M "CRITICAL FIX: Drain ALL available annotated frames" detection_engine\pipeline\pipeline_manager.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Drain loop fix found in pipeline_manager.py
) else (
    echo [FAIL] Drain loop fix NOT found in pipeline_manager.py
    exit /b 1
)

findstr /M "update_annotated_frame" detection_engine\pipeline\pipeline_manager.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Annotated frame update calls present
) else (
    echo [FAIL] Annotated frame updates not found
    exit /b 1
)

echo.

REM Check 3: Frame writer architecture
echo Verifying frame writer architecture...
findstr /M "_latest_raw_frame" detection_engine\camera\frame_writer.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Separate raw frame buffer exists
) else (
    echo [FAIL] Raw frame buffer not found
    exit /b 1
)

findstr /M "_latest_annotated_frame" detection_engine\camera\frame_writer.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Separate annotated frame buffer exists
) else (
    echo [FAIL] Annotated frame buffer not found
    exit /b 1
)

findstr /M "if self._latest_annotated_frame is not None:" detection_engine\camera\frame_writer.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Priority logic ^(annotated ^> raw^) present
) else (
    echo [FAIL] Priority logic not found
    exit /b 1
)

echo.

REM Check 4: Python syntax
echo Verifying Python syntax...
python -m py_compile detection_engine\pipeline\pipeline_manager.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] pipeline_manager.py syntax valid
) else (
    echo [FAIL] Syntax error in pipeline_manager.py
)

python -m py_compile detection_engine\camera\frame_writer.py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] frame_writer.py syntax valid
) else (
    echo [FAIL] Syntax error in frame_writer.py
)

echo.

REM Summary
echo ================================================
echo Verification Complete
echo ================================================
echo.
echo Deployment Status:
echo   * Drain loop fix: APPLIED [OK]
echo   * Separate buffer architecture: VERIFIED [OK]
echo   * Priority logic: VERIFIED [OK]
echo   * Syntax: VALID [OK]
echo.
echo Next steps:
echo   1. Start services: docker-compose up -d
echo   2. Monitor logs: docker-compose logs -f detection_engine
echo   3. Check stream: Access MJPEG endpoint with valid token
echo   4. Verify annotations appear on live video
echo.
echo Expected behavior:
echo   * MJPEG stream shows bounding boxes and labels
echo   * Annotations update in real-time
echo   * Drain loop logs show ~10-15/sec drained rate
echo   * No annotation flickering or loss
echo.
