# Deskbird One-Line Windows Installer
# Usage: irm https://raw.githubusercontent.com/rish170/deskbird/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                DESKBIRD DESKTOP INSTALLER                " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js was not found on this machine." -ForegroundColor Red
    Write-Host "Please install Node.js (LTS) from https://nodejs.org and re-run this command." -ForegroundColor Yellow
    exit 1
}

$installDir = "$env:LOCALAPPDATA\Deskbird"
Write-Host "[1/3] Setting up Deskbird in $installDir..." -ForegroundColor Yellow

if (Test-Path $installDir) {
    Write-Host "Existing installation found. Updating..." -ForegroundColor DarkGray
    if (Test-Path "$installDir\.git") {
        git -C $installDir pull --quiet
    }
} else {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        git clone --quiet --depth 1 https://github.com/rish170/deskbird.git $installDir
    } else {
        Write-Host "Downloading Deskbird repository archive..." -ForegroundColor DarkGray
        $zipPath = "$env:TEMP\deskbird-main.zip"
        Invoke-WebRequest -Uri "https://github.com/rish170/deskbird/archive/refs/heads/main.zip" -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\deskbird-extracted" -Force
        Move-Item -Path "$env:TEMP\deskbird-extracted\deskbird-main" -Destination $installDir -Force
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "$env:TEMP\deskbird-extracted" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 2. Install dependencies
Write-Host "[2/3] Installing dependencies..." -ForegroundColor Yellow
Push-Location $installDir
try {
    npm install --silent
} finally {
    Pop-Location
}

# 3. Launch Deskbird in background
Write-Host "[3/3] Launching Deskbird companion..." -ForegroundColor Green
$birdDir = "$installDir\bird"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run start -w bird" -WorkingDirectory $installDir -WindowStyle Hidden

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  ✓ Deskbird is running! Look for the bird on your screen. " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

