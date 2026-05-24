# Trading Dashboard — Windows Development Startup Script
# Run from: C:\Users\janwe\claude\tradingbot\dashboard\
# Usage: .\scripts\start-dev.ps1

$ErrorActionPreference = "Stop"
$DashboardDir = Split-Path -Parent $PSScriptRoot

Write-Host "Trading Dashboard — Dev Startup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 1. Check .env
$EnvFile = Join-Path $DashboardDir ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host ".env not found — copying from .env.example" -ForegroundColor Yellow
    Copy-Item (Join-Path $DashboardDir ".env.example") $EnvFile
    Write-Host "IMPORTANT: Edit .env and add your ANTHROPIC_API_KEY!" -ForegroundColor Red
    Start-Process notepad $EnvFile
    exit 1
}

# 2. Check Python venv
$VenvDir = Join-Path $DashboardDir "backend\.venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

$PipPath = Join-Path $VenvDir "Scripts\pip.exe"
$PythonPath = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
& $PipPath install -r (Join-Path $DashboardDir "backend\requirements.txt") --quiet

# 3. Check Node deps
$NodeModules = Join-Path $DashboardDir "frontend\node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
    Push-Location (Join-Path $DashboardDir "frontend")
    npm install
    Pop-Location
}

# 4. Start backend in new terminal
Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Green
$BackendCmd = "cd '$DashboardDir\backend'; & '$PythonPath' -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

Start-Sleep -Seconds 3

# 5. Start frontend in new terminal
Write-Host "Starting Next.js frontend on http://localhost:3000 ..." -ForegroundColor Green
$FrontendCmd = "cd '$DashboardDir\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendCmd

Write-Host ""
Write-Host "Dashboard URLs:" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Health:    http://localhost:8000/api/health" -ForegroundColor White
Write-Host ""
Write-Host "Both services started in separate terminals." -ForegroundColor Green
