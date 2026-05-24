# migrate.ps1 — Apply Alembic database migrations
# Usage: .\scripts\migrate.ps1 [upgrade|downgrade|current|history]
param(
    [string]$Command = "upgrade",
    [string]$Revision = "head"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Split-Path -Parent $ScriptDir

Push-Location $BackendDir

try {
    switch ($Command) {
        "upgrade" {
            Write-Host "Applying migrations: alembic upgrade $Revision" -ForegroundColor Cyan
            alembic upgrade $Revision
        }
        "downgrade" {
            Write-Host "Rolling back: alembic downgrade $Revision" -ForegroundColor Yellow
            alembic downgrade $Revision
        }
        "current" {
            alembic current
        }
        "history" {
            alembic history --verbose
        }
        default {
            Write-Error "Unknown command: $Command. Use: upgrade, downgrade, current, history"
            exit 1
        }
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Migrations applied successfully." -ForegroundColor Green
    } else {
        Write-Error "Migration failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
