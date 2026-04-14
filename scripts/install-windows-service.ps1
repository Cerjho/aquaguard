# AquaGuard Detection Engine - Windows Service Wrapper
# Install as Windows service using NSSM (Non-Sucking Service Manager)
#
# Installation:
# 1. Download NSSM: https://nssm.cc/download
# 2. Run this script in PowerShell as Administrator

param(
    [ValidateSet('install', 'start', 'stop', 'restart', 'remove')]
    [string]$Action = 'install'
)

$ServiceName = "AquaGuardDetection"
$DisplayName = "AquaGuard Drowning Detection Engine"
$Description = "Critical life-safety system for drowning detection and alerting"

# Paths - UPDATE THESE FOR YOUR INSTALLATION
$ProjectRoot = "C:\aquaguard"
$PythonExe = "$ProjectRoot\aquaguard_env\Scripts\python.exe"
$ScriptPath = "$ProjectRoot\detection_engine\main.py"
$LogDir = "$ProjectRoot\logs"

# Ensure log directory exists
if (!(Test-Path $LogDir)) {
    New-Item -Path $LogDir -ItemType Directory -Force
}

switch ($Action) {
    'install' {
        Write-Host "Installing $DisplayName as Windows Service..."
        
        # Check if NSSM is installed
        $nssm = Get-Command nssm -ErrorAction SilentlyContinue
        if (!$nssm) {
            Write-Error "NSSM not found! Please install from https://nssm.cc/download"
            exit 1
        }
        
        # Install service
        nssm install $ServiceName $PythonExe $ScriptPath
        
        # Configure service
        nssm set $ServiceName DisplayName $DisplayName
        nssm set $ServiceName Description $Description
        nssm set $ServiceName AppDirectory $ProjectRoot
        nssm set $ServiceName Start SERVICE_AUTO_START
        
        # Restart settings - CRITICAL for life-safety
        nssm set $ServiceName AppExit Default Restart
        nssm set $ServiceName AppRestartDelay 5000  # 5 seconds
        nssm set $ServiceName AppThrottle 10000     # 10 seconds
        
        # Logging
        nssm set $ServiceName AppStdout "$LogDir\detection_stdout.log"
        nssm set $ServiceName AppStderr "$LogDir\detection_stderr.log"
        nssm set $ServiceName AppRotateFiles 1
        nssm set $ServiceName AppRotateOnline 1
        nssm set $ServiceName AppRotateBytes 10485760  # 10MB
        
        Write-Host "✅ Service installed successfully!"
        Write-Host "Start with: .\install-windows-service.ps1 -Action start"
    }
    
    'start' {
        Write-Host "Starting $DisplayName..."
        Start-Service $ServiceName
        Write-Host "✅ Service started!"
        Get-Service $ServiceName
    }
    
    'stop' {
        Write-Host "Stopping $DisplayName..."
        Stop-Service $ServiceName
        Write-Host "✅ Service stopped!"
        Get-Service $ServiceName
    }
    
    'restart' {
        Write-Host "Restarting $DisplayName..."
        Restart-Service $ServiceName
        Write-Host "✅ Service restarted!"
        Get-Service $ServiceName
    }
    
    'remove' {
        Write-Host "Removing $DisplayName..."
        $service = Get-Service $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            if ($service.Status -eq 'Running') {
                Stop-Service $ServiceName
            }
            nssm remove $ServiceName confirm
            Write-Host "✅ Service removed!"
        } else {
            Write-Host "Service not found."
        }
    }
}
