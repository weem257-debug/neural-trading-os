# Neural Trading OS — Start-Skript
# Startet Backend (FastAPI) + Frontend (Next.js) parallel in separaten Fenstern
# und oeffnet den Browser sobald beide Services erreichbar sind.
#
# Voraussetzungen:
#   - Python + venv unter dashboard\backend\.venv (oder global installiert)
#   - Node.js + npm installiert
#   - .env im dashboard\ Ordner vorhanden (ANTHROPIC_API_KEY etc.)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"

$BackendUrl  = "http://localhost:8000/api/health"
$FrontendUrl = "http://localhost:3000"
$MaxWaitSec  = 60

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Neural Trading OS — Starting up..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------
# Helper: check if a URL responds with HTTP 200
# ------------------------------------------------------------------
function Wait-ForUrl {
    param(
        [string]$Url,
        [string]$ServiceName,
        [int]$TimeoutSec = $MaxWaitSec
    )
    Write-Host "Waiting for $ServiceName at $Url ..." -ForegroundColor Yellow
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "  $ServiceName is ready." -ForegroundColor Green
                return $true
            }
        } catch {
            # Not ready yet
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "  [$elapsed s] still waiting..." -ForegroundColor DarkGray
    }
    Write-Host "  WARNING: $ServiceName did not respond within ${TimeoutSec}s." -ForegroundColor Red
    return $false
}

# ------------------------------------------------------------------
# Activate Python venv if present
# ------------------------------------------------------------------
$VenvActivate = Join-Path $BackendDir ".venv\Scripts\Activate.ps1"
if (Test-Path $VenvActivate) {
    $BackendCmd = "& '$VenvActivate'; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
} else {
    $BackendCmd = "uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
}

# ------------------------------------------------------------------
# Start Backend in new PowerShell window
# ------------------------------------------------------------------
Write-Host "Starting Backend  (FastAPI on port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BackendDir'; $BackendCmd"
)

# ------------------------------------------------------------------
# Start Frontend in new PowerShell window
# ------------------------------------------------------------------
Write-Host "Starting Frontend (Next.js on port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$FrontendDir'; npm run dev"
)

Write-Host ""
Write-Host "Both services launched. Waiting for readiness..." -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------------
# Wait for Backend then Frontend
# ------------------------------------------------------------------
$backendReady  = Wait-ForUrl -Url $BackendUrl  -ServiceName "Backend"
$frontendReady = Wait-ForUrl -Url $FrontendUrl -ServiceName "Frontend"

Write-Host ""
if ($backendReady -and $frontendReady) {
    Write-Host "All systems go. Opening browser..." -ForegroundColor Green
    Start-Process $FrontendUrl
} elseif ($frontendReady) {
    Write-Host "Frontend ready (Backend may still be starting). Opening browser..." -ForegroundColor Yellow
    Start-Process $FrontendUrl
} else {
    Write-Host "Services may still be starting. Navigate manually to: $FrontendUrl" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend : http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
