# AquaGuard - Start all development services (Windows)
# Run from the AquaGuard/ repo root as: .\scripts\start_dev.ps1

param(
    [switch]$SkipMqtt,
    [switch]$SkipTurn,
    [switch]$SkipFrontend,
    [switch]$ForceRestartBackend
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

    try {
        $processMatches = Get-Process | Where-Object { $_.ProcessName -match $Pattern }
        return @($processMatches).Count -gt 0
    } catch {
        return $false
    }
}

function Test-TcpPortListening {
    param(
        [Parameter(Mandatory = $true)][int]$Port
    )
    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop).Count -gt 0
    } catch {
        return $false
    }
}

function Wait-BackendReady {
    param(
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            # Unauthorized is acceptable here; it confirms backend route is alive.
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/v1/system/status" -TimeoutSec 3 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            if ($statusCode -eq 401 -or $statusCode -eq 403) {
                return $true
            }
        }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

function Stop-JobSafe {
    param(
        [Parameter(Mandatory = $true)]$Job
    )
    if ($null -ne $Job) {
        Stop-Job $Job -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $Job -ErrorAction SilentlyContinue | Out-Null
    }
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
if ($ForceRestartBackend) {
    Write-Host "    Force restarting backend processes..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue `
        | Where-Object {
            $_.Name -match 'python(\.exe)?$' -and $_.CommandLine -match 'backend\\wsgi\.py'
        } `
        | ForEach-Object {
            try {
                Stop-Process -Id $_.ProcessId -ErrorAction Stop
                Write-Host "    Stopped backend PID $($_.ProcessId)" -ForegroundColor Yellow
            } catch {
                Write-Host "    WARNING: Failed to stop PID $($_.ProcessId): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
}

$backendPortListening = Test-TcpPortListening -Port 5000
if ($backendPortListening -and -not $ForceRestartBackend) {
    Write-Host "    Port 5000 already listening (backend assumed running, skip start)" -ForegroundColor Yellow
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

# 4.1 Wait for backend readiness before starting frontend
Write-Host "==> Waiting for backend readiness..." -ForegroundColor Green
if (Wait-BackendReady -BaseUrl "http://localhost:5000" -TimeoutSeconds 45) {
    Write-Host "    Backend is reachable." -ForegroundColor Green
} else {
    Write-Host "    WARNING: Backend did not become reachable within timeout." -ForegroundColor Yellow
    Write-Host "             Frontend may show stale/offline status until backend is ready." -ForegroundColor Yellow
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
    Stop-JobSafe -Job $backendJob
    if (-not $SkipFrontend) { Stop-JobSafe -Job $frontendJob }
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
