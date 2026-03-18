# AquaGuard - Start all development services (Windows)
# Run from the AquaGuard/ repo root as: .\scripts\start_dev.ps1

param(
    [switch]$SkipMqtt,
    [switch]$SkipFrontend
)

$ROOT = Split-Path -Parent $PSScriptRoot
$VENV_PYTHON = "$ROOT\aquaguard_env\Scripts\python.exe"
$VENV_ACTIVATE = "$ROOT\aquaguard_env\Scripts\Activate.ps1"

Write-Host "==> AquaGuard Dev Environment Starting..." -ForegroundColor Cyan

# 1. Verify venv exists
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "ERROR: venv not found at $VENV_PYTHON" -ForegroundColor Red
    Write-Host "       Create it with: python -m venv aquaguard_env" -ForegroundColor Yellow
    exit 1
}

# 2. Start Mosquitto MQTT broker
if (-not $SkipMqtt) {
    Write-Host "==> Starting Mosquitto MQTT broker..." -ForegroundColor Green
    $mosquittoPath = "C:\Program Files\mosquitto\mosquitto.exe"
    if (Test-Path $mosquittoPath) {
        Start-Process -FilePath $mosquittoPath `
            -ArgumentList "-c `"$ROOT\mqtt\mosquitto.conf`"" `
            -WindowStyle Minimized
        Write-Host "    Mosquitto running on port 1883" -ForegroundColor Green
    } else {
        Write-Host "    WARNING: Mosquitto not found. Install from https://mosquitto.org/download/" -ForegroundColor Yellow
        Write-Host "    Or run: winget install EclipseFoundation.Mosquitto" -ForegroundColor Yellow
    }
}

# 3. Start Flask backend
Write-Host "==> Starting Flask backend..." -ForegroundColor Green
$backendScript = {
    param($root, $activate)
    & $activate
    Set-Location "$root\backend"
    $env:FLASK_APP = "wsgi.py"
    $env:FLASK_ENV = "development"
    python -m flask run --port=5000
}
$backendJob = Start-Job -ScriptBlock $backendScript -ArgumentList $ROOT, $VENV_ACTIVATE
Write-Host "    Flask starting on http://localhost:5000" -ForegroundColor Green

# 4. Start React frontend
if (-not $SkipFrontend) {
    Write-Host "==> Starting React dashboard..." -ForegroundColor Green
    $frontendScript = {
        param($root)
        Set-Location "$root\frontend"
        npm start
    }
    $frontendJob = Start-Job -ScriptBlock $frontendScript -ArgumentList $ROOT
    Write-Host "    React starting on http://localhost:3000" -ForegroundColor Green
}

Write-Host ""
Write-Host "All services starting. Check individual terminals for output." -ForegroundColor Cyan
Write-Host "Detection engine: run manually in a new terminal:" -ForegroundColor Cyan
Write-Host "    .\aquaguard_env\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "    python detection_engine\main.py" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow

try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    Write-Host "Stopping services..." -ForegroundColor Red
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    if (-not $SkipFrontend) { Stop-Job $frontendJob -ErrorAction SilentlyContinue }
    Get-Process mosquitto -ErrorAction SilentlyContinue | Stop-Process
}
