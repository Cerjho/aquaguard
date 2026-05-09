$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "       AquaGuard - Dynamic Startup Script     " -ForegroundColor Cyan
Write-Host "         aquaguard.local (prod-like)           " -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 1: Detect active LAN IP ----------------------------------------
# Ignore: Loopback, Docker vEthernet, WSL, and APIPA (169.254.x.x)
$ip = (
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Docker' -and
        $_.IPAddress -notmatch '^169\.254\.'
    } |
    Sort-Object -Property InterfaceIndex |
    Select-Object -ExpandProperty IPAddress -First 1
)

if ([string]::IsNullOrWhiteSpace($ip)) {
    Write-Host "  [!] Could not detect LAN IP. TURN relay may not work." -ForegroundColor Yellow
    Write-Host "      Continuing with existing .env values..." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "  [+] Detected LAN IP: $ip" -ForegroundColor Green
    Write-Host ""

    # -- Step 2: Patch .env with the detected IP --------------------------
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw

        # --- TURN_EXTERNAL_IP ---
        if ($envContent -match '(?m)^TURN_EXTERNAL_IP=(.*)') {
            $oldTurnIp = $Matches[1].Trim()
            $envContent = $envContent -replace '(?m)^TURN_EXTERNAL_IP=.*', "TURN_EXTERNAL_IP=$ip"
            Write-Host "  [~] TURN_EXTERNAL_IP: $oldTurnIp -> $ip" -ForegroundColor DarkGray
        } else {
            $envContent = $envContent.TrimEnd() + "`nTURN_EXTERNAL_IP=$ip`n"
            Write-Host "  [+] TURN_EXTERNAL_IP: (added) $ip" -ForegroundColor DarkGray
        }

        # --- WEBRTC_TURN_URL (replace any IP with the new one) ---
        if ($envContent -match '(?m)^WEBRTC_TURN_URL=(.*)') {
            $oldTurnUrl = $Matches[1].Trim()
            $newTurnUrl = $oldTurnUrl -replace '\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', $ip
            if ($newTurnUrl -ne $oldTurnUrl) {
                $envContent = $envContent -replace [regex]::Escape("WEBRTC_TURN_URL=$oldTurnUrl"), "WEBRTC_TURN_URL=$newTurnUrl"
                Write-Host "  [~] WEBRTC_TURN_URL: updated IPs to $ip" -ForegroundColor DarkGray
            }
        }

        # --- CORS_ALLOWED_ORIGINS (preserve aquaguard.local, update IP entries) ---
        if ($envContent -match '(?m)^CORS_ALLOWED_ORIGINS=(.*)') {
            $oldCors = $Matches[1].Trim()
            $newCors = $oldCors -replace '\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', $ip
            if ($newCors -ne $oldCors) {
                $envContent = $envContent -replace [regex]::Escape("CORS_ALLOWED_ORIGINS=$oldCors"), "CORS_ALLOWED_ORIGINS=$newCors"
                Write-Host "  [~] CORS_ALLOWED_ORIGINS: updated IPs to $ip" -ForegroundColor DarkGray
            }
        }

        Set-Content ".env" $envContent -NoNewline
        Write-Host ""
        Write-Host "  [OK] .env patched successfully." -ForegroundColor Green
    } else {
        Write-Host "  [!] .env file not found - skipping." -ForegroundColor Yellow
    }
}

# -- Step 3: Start Docker containers (prod-like with edge/Caddy) ---------
Write-Host ""
Write-Host "  Starting Docker containers (prod-like)..." -ForegroundColor Cyan
Write-Host ""
docker-compose -f docker-compose.yml -f docker-compose.prodlike.yml up -d --remove-orphans

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "       AquaGuard started successfully!        " -ForegroundColor Green
Write-Host "                                              " -ForegroundColor Green
Write-Host "   Dashboard:  http://aquaguard.local         " -ForegroundColor Green
if (-not [string]::IsNullOrWhiteSpace($ip)) {
    Write-Host "   LAN IP:     http://$($ip):3000             " -ForegroundColor Green
}
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
