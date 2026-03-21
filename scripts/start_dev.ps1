# AquaGuard - Start all development services (Windows)
# Run from the AquaGuard/ repo root as: .\scripts\start_dev.ps1

param(
    [switch]$SkipMqtt,
    [switch]$SkipTurn,
    [switch]$SkipFrontend
)

$ROOT = Split-Path -Parent $PSScriptRoot
$VENV_PYTHON = "$ROOT\aquaguard_env\Scripts\python.exe"
$VENV_ACTIVATE = "$ROOT\aquaguard_env\Scripts\Activate.ps1"
$backendJob = $null
$frontendJob = $null

function Test-ProcessCommandLine {
    param(
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    $matches = Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -and $_.CommandLine -match $Pattern }
    return @($matches).Count -gt 0
}

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
        if (Get-Process mosquitto -ErrorAction SilentlyContinue) {
            Write-Host "    Mosquitto already running (skip start)" -ForegroundColor Yellow
        } else {
            Start-Process -FilePath $mosquittoPath `
                -ArgumentList "-c `"$ROOT\mqtt\mosquitto.conf`"" `
                -WindowStyle Minimized
            Write-Host "    Mosquitto running on port 1883" -ForegroundColor Green
        }
    } else {
        Write-Host "    WARNING: Mosquitto not found. Install from https://mosquitto.org/download/" -ForegroundColor Yellow
        Write-Host "    Or run: winget install EclipseFoundation.Mosquitto" -ForegroundColor Yellow
    }
}

# 3. Start local TURN service via Docker (coturn)
if (-not $SkipTurn) {
    Write-Host "==> Starting TURN service (coturn) via docker compose..." -ForegroundColor Green
    try {
        docker compose up -d coturn | Out-Null
        Write-Host "    coturn running on port 3478 (tcp/udp)" -ForegroundColor Green
    } catch {
        Write-Host "    WARNING: Could not start coturn. Ensure Docker Desktop is running." -ForegroundColor Yellow
    }
}

# 4. Start Flask backend
Write-Host "==> Starting Flask backend..." -ForegroundColor Green
if (Test-ProcessCommandLine -Pattern 'wsgi\.py') {
    Write-Host "    Flask backend already running (skip start)" -ForegroundColor Yellow
} else {
    $backendScript = {
        param($root, $activate)
        & $activate
        Set-Location "$root\backend"
        python wsgi.py
    }
    $backendJob = Start-Job -ScriptBlock $backendScript -ArgumentList $ROOT, $VENV_ACTIVATE
    Write-Host "    Flask starting on http://localhost:5000" -ForegroundColor Green
}

# 5. Start React frontend
if (-not $SkipFrontend) {
    Write-Host "==> Starting React dashboard..." -ForegroundColor Green
    if (Test-ProcessCommandLine -Pattern 'react-scripts\s+start') {
        Write-Host "    React dashboard already running (skip start)" -ForegroundColor Yellow
    } else {
        $frontendScript = {
            param($root)
            Set-Location "$root\frontend"
            npm start
        }
        $frontendJob = Start-Job -ScriptBlock $frontendScript -ArgumentList $ROOT
        Write-Host "    React starting on http://localhost:3000" -ForegroundColor Green
    }
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
    if ($backendJob) { Stop-Job $backendJob -ErrorAction SilentlyContinue }
    if (-not $SkipFrontend -and $frontendJob) { Stop-Job $frontendJob -ErrorAction SilentlyContinue }
    if (-not $SkipTurn) {
        try {
            docker compose stop coturn | Out-Null
        } catch {
            Write-Host "    WARNING: Unable to stop coturn automatically." -ForegroundColor Yellow
        }
    }
    Get-Process mosquitto -ErrorAction SilentlyContinue | Stop-Process
    Write-Host "    NOTE: stop Mosquitto manually if still running." -ForegroundColor Yellow
}
