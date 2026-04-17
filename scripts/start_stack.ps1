# AquaGuard - Start container stack for demo/deployment (Windows)
# Run from repo root: .\scripts\start_stack.ps1

param(
    [switch]$NoBuild,
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $Root 'docker-compose.yml'
$EnvFile = Join-Path $Root '.env'
$EnvExampleFile = Join-Path $Root '.env.example'

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string[]]$Urls,
        [Parameter(Mandatory = $true)][int]$Timeout,
        [int[]]$ExpectedStatusCodes = @(200, 401, 403)
    )

    $deadline = (Get-Date).AddSeconds($Timeout)

    while ((Get-Date) -lt $deadline) {
        foreach ($url in $Urls) {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 4 -ErrorAction Stop
                if ($ExpectedStatusCodes -contains [int]$response.StatusCode) {
                    return $url
                }
            } catch {
                $statusCode = $null
                if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                    $statusCode = [int]$_.Exception.Response.StatusCode
                }
                if ($null -ne $statusCode -and ($ExpectedStatusCodes -contains $statusCode)) {
                    return $url
                }
            }
        }

        Start-Sleep -Seconds 2
    }

    return $null
}

Write-Step 'AquaGuard container bootstrap starting'

if (-not (Test-Command -Name 'docker')) {
    throw 'Docker CLI was not found. Install Docker Desktop and retry.'
}

& docker info | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker daemon is not reachable. Start Docker Desktop and retry.'
}

if (-not (Test-Path $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
}

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExampleFile) {
        Copy-Item $EnvExampleFile $EnvFile
        Write-Host 'Created .env from .env.example. Review secrets before production use.' -ForegroundColor Yellow
    } else {
        throw '.env and .env.example are both missing. Cannot continue.'
    }
}

$upArgs = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile, 'up', '-d')
if (-not $NoBuild) {
    $upArgs += '--build'
}

Write-Step 'Starting Docker Compose services'
& docker @upArgs
if ($LASTEXITCODE -ne 0) {
    throw 'docker compose up failed. Inspect the output above.'
}

Write-Step 'Waiting for backend readiness'
$backendReadyUrl = Wait-HttpEndpoint `
    -Urls @(
        'http://localhost:5000/api/health',
        'http://localhost:5000/api/v1/system/status'
    ) `
    -Timeout $TimeoutSeconds
if ($null -eq $backendReadyUrl) {
    throw "Backend readiness check timed out after $TimeoutSeconds seconds."
}
Write-Host "Backend is reachable via: $backendReadyUrl" -ForegroundColor Green

Write-Step 'Waiting for frontend readiness'
$frontendReadyUrl = Wait-HttpEndpoint `
    -Urls @('http://localhost:3000') `
    -Timeout $TimeoutSeconds `
    -ExpectedStatusCodes @(200)
if ($null -eq $frontendReadyUrl) {
    throw "Frontend readiness check timed out after $TimeoutSeconds seconds."
}
Write-Host "Frontend is reachable via: $frontendReadyUrl" -ForegroundColor Green

Write-Step 'Current compose service status'
& docker compose --env-file $EnvFile -f $ComposeFile ps

Write-Host ''
Write-Host 'AquaGuard stack is up.' -ForegroundColor Green
Write-Host 'To stream logs: docker compose logs -f backend frontend detection_engine' -ForegroundColor Yellow
Write-Host 'To stop:        docker compose down' -ForegroundColor Yellow
