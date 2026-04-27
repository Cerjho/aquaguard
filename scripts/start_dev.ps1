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
$backendJob = $null
$frontendJob = $null

function New-RandomSecret {
    param(
        [int]$ByteLength = 24
    )

    $bytes = New-Object byte[] $ByteLength
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    $token = [Convert]::ToBase64String($bytes)
    # Make the token .env friendly.
    $token = $token.Replace('+', '-').Replace('/', '_').TrimEnd('=')
    return $token
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Key
    )

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    foreach ($line in Get-Content $FilePath) {
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            return $value
        }
    }

    return $null
}

function Set-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $lineToWrite = "$Key=$Value"
    if (-not (Test-Path $FilePath)) {
        Set-Content -Path $FilePath -Value $lineToWrite -Encoding utf8
        return
    }

    $lines = @(Get-Content $FilePath)
    $keyPattern = "^\s*$([regex]::Escape($Key))\s*="
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $keyPattern) {
            $lines[$i] = $lineToWrite
            $found = $true
            break
        }
    }

    if (-not $found) {
        $lines += $lineToWrite
    }

    Set-Content -Path $FilePath -Value $lines -Encoding utf8
}

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

# 1a. Bootstrap backend/.env from .env.example if it doesn't exist
$backendEnv = "$ROOT\backend\.env"
$backendEnvExample = "$ROOT\backend\.env.example"
if (-not (Test-Path $backendEnv)) {
    if (Test-Path $backendEnvExample) {
        Copy-Item $backendEnvExample $backendEnv
        Write-Host "==> Created backend\.env from backend\.env.example" -ForegroundColor Green
        Write-Host "    IMPORTANT: Review and update backend\.env with your own secrets." -ForegroundColor Yellow
    } else {
        Write-Host "WARNING: backend\.env not found and backend\.env.example is missing." -ForegroundColor Yellow
        Write-Host "         The backend requires SECRET_KEY and JWT_SECRET_KEY to start." -ForegroundColor Yellow
    }
} else {
    Write-Host "==> backend\.env already exists (skipping copy from example)." -ForegroundColor Green
}

# 1b. Bootstrap frontend/.env if it doesn't exist
$frontendEnv = "$ROOT\frontend\.env"
if (-not (Test-Path $frontendEnv)) {
    @"
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=http://localhost:5000
"@ | Set-Content $frontendEnv
    Write-Host "==> Created frontend\.env with default API URL settings." -ForegroundColor Green
}

# 1c. Initialize database (migrations + seed)
Write-Host "==> Initializing database (migrations + seed)..." -ForegroundColor Green
$seedAdminPassword = if (-not [string]::IsNullOrWhiteSpace($env:SEED_ADMIN_PASSWORD)) {
    $env:SEED_ADMIN_PASSWORD
} else {
    Get-DotEnvValue -FilePath $backendEnv -Key 'SEED_ADMIN_PASSWORD'
}
$seedGuardPassword = if (-not [string]::IsNullOrWhiteSpace($env:SEED_GUARD_PASSWORD)) {
    $env:SEED_GUARD_PASSWORD
} else {
    Get-DotEnvValue -FilePath $backendEnv -Key 'SEED_GUARD_PASSWORD'
}

$generatedAdminSeed = $false
$generatedGuardSeed = $false

if ([string]::IsNullOrWhiteSpace($seedAdminPassword)) {
    $seedAdminPassword = New-RandomSecret
    $generatedAdminSeed = $true
    Write-Host "    WARNING: SEED_ADMIN_PASSWORD not set; generated a random value for this run." -ForegroundColor Yellow
}
if ([string]::IsNullOrWhiteSpace($seedGuardPassword)) {
    $seedGuardPassword = New-RandomSecret
    $generatedGuardSeed = $true
    Write-Host "    WARNING: SEED_GUARD_PASSWORD not set; generated a random value for this run." -ForegroundColor Yellow
}

$env:SEED_ADMIN_PASSWORD = $seedAdminPassword
$env:SEED_GUARD_PASSWORD = $seedGuardPassword
$env:ALLOW_UNSAFE_WERKZEUG = '1'

if ($generatedAdminSeed) {
    Set-DotEnvValue -FilePath $backendEnv -Key 'SEED_ADMIN_PASSWORD' -Value $seedAdminPassword
    Write-Host "    Persisted generated SEED_ADMIN_PASSWORD to backend\.env" -ForegroundColor Green
}
if ($generatedGuardSeed) {
    Set-DotEnvValue -FilePath $backendEnv -Key 'SEED_GUARD_PASSWORD' -Value $seedGuardPassword
    Write-Host "    Persisted generated SEED_GUARD_PASSWORD to backend\.env" -ForegroundColor Green
}

$env:FLASK_APP = "wsgi.py"
$env:FLASK_ENV = "development"
$env:APP_ENV = "development"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:3000"
Push-Location "$ROOT\backend"
try {
    $ErrorActionPreference = 'Stop'
    & $VENV_PYTHON -m flask db upgrade
    if ($LASTEXITCODE -ne 0) { throw "flask db upgrade exited with code $LASTEXITCODE" }
    Write-Host "    flask db upgrade: OK" -ForegroundColor Green
    & $VENV_PYTHON seed.py
    if ($LASTEXITCODE -ne 0) { throw "seed.py exited with code $LASTEXITCODE" }
    Write-Host "    seed.py: OK" -ForegroundColor Green
} catch {
    Write-Host "    WARNING: Database initialization failed: $($_.Exception.Message)" -ForegroundColor Yellow
} finally {
    $ErrorActionPreference = 'Continue'
    Pop-Location
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
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        Write-Host "    WARNING: Docker CLI not found. Skipping coturn startup." -ForegroundColor Yellow
    } else {
        $dockerInfoOutput = & docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    WARNING: Docker daemon is not reachable. Start Docker Desktop, then rerun this script." -ForegroundColor Yellow
            if (-not [string]::IsNullOrWhiteSpace(($dockerInfoOutput | Out-String).Trim())) {
                Write-Host "    Docker error: $($dockerInfoOutput | Select-Object -First 1)" -ForegroundColor Yellow
            }
        } else {
            $composeOutput = & docker compose --env-file "$backendEnv" up -d coturn 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "    coturn running on port 3478 (tcp/udp)" -ForegroundColor Green
            } else {
                Write-Host "    WARNING: Could not start coturn. Ensure Docker Desktop is running." -ForegroundColor Yellow
                if (-not [string]::IsNullOrWhiteSpace(($composeOutput | Out-String).Trim())) {
                    Write-Host "    docker compose output: $($composeOutput | Select-Object -First 1)" -ForegroundColor Yellow
                }
            }
        }
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
    # Pass all required env vars into the job. Start-Job runs in an isolated
    # process that does NOT inherit $env: vars set in this session.
    $backendEnvVars = @{
        FLASK_APP              = $env:FLASK_APP
        FLASK_ENV              = $env:FLASK_ENV
        FLASK_DEBUG            = $env:FLASK_DEBUG
        APP_ENV                = $env:APP_ENV
        CORS_ALLOWED_ORIGINS   = $env:CORS_ALLOWED_ORIGINS
        ALLOW_UNSAFE_WERKZEUG  = $env:ALLOW_UNSAFE_WERKZEUG
        SEED_ADMIN_PASSWORD    = $env:SEED_ADMIN_PASSWORD
        SEED_GUARD_PASSWORD    = $env:SEED_GUARD_PASSWORD
    }
    $backendScript = {
        param($root, $pythonPath, $envVars)
        foreach ($key in $envVars.Keys) {
            [System.Environment]::SetEnvironmentVariable($key, $envVars[$key], 'Process')
        }
        Set-Location "$root\backend"
        & $pythonPath wsgi.py
    }
    $backendJob = Start-Job -ScriptBlock $backendScript -ArgumentList $ROOT, $VENV_PYTHON, $backendEnvVars
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
            $env:REACT_APP_API_URL="http://localhost:5000"
            $env:REACT_APP_WS_URL="http://localhost:5000"
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
