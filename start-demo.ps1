<#
.SYNOPSIS
Start the demo backend (docker compose) and the redesign frontend together.

.EXAMPLE
.\start-demo.ps1
.\start-demo.ps1 -Offline   # dockerised backend with OFFLINE_DEMO_MODE=true
#>
param(
    [string]$BackendRepo = 'D:\querymind',
    [string]$FrontendRepo = 'D:\querymind-frontend',
    [switch]$Offline,
    # Accepted for symmetry with the demo script; live is the default.
    [switch]$Live
)

if ($Offline -and $Live) {
    throw 'Choose either -Offline or -Live, not both.'
}

$ErrorActionPreference = 'Stop'

function Assert-RepoBranch {
    param([string]$Repo, [string]$Expected)
    $branch = git -C $Repo rev-parse --abbrev-ref HEAD
    if ($LASTEXITCODE -ne 0 -or $branch -ne $Expected) {
        throw "$Repo is on '$branch'; expected '$Expected'. Refusing to start the demo."
    }
    Write-Host "OK branch: $Repo -> $branch"
}

function Assert-PortFree {
    param([int]$Port, [int]$TimeoutSec = 5)
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $listeners) {
            Write-Host "OK port free: $Port"
            return
        }
        Start-Sleep -Seconds 1
    }
    $pids = ($listeners.OwningProcess | Sort-Object -Unique) -join ','
    throw "Port $Port is already in use by PID $pids. Stop that process and retry."
}

function Stop-DemoFrontend {
    <# A rerun after a backend edit must not fail on the frontend it started
       last time. Only a Vite process from this repo is stopped; any other
       listener is left alone and reported. #>
    param([string]$FrontendRepo)
    $listeners = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) { return }
    foreach ($owner in ($listeners.OwningProcess | Sort-Object -Unique)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
        $command = [string]$process.CommandLine
        if ($command -like "*querymind-frontend*") {
            Write-Host "Stopping existing demo frontend (PID $owner)"
            Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
        } else {
            throw "Port 5174 is in use by PID $owner ($command). Stop it first."
        }
    }
    Start-Sleep -Milliseconds 700
}

Assert-RepoBranch -Repo $BackendRepo -Expected 'hardening'
Assert-RepoBranch -Repo $FrontendRepo -Expected 'frontend-redesign'

# The backend code is bind-mounted and uvicorn has no auto-reload, so an old
# container would silently serve stale Python. Stop it first: the port check
# below would otherwise refuse to run, and `up --force-recreate` could not
# replace a container that is still holding port 8000.
Push-Location $BackendRepo
try {
    $existingBackend = docker compose ps -q backend 2>$null
    if ($existingBackend) {
        Write-Host 'Stopping existing backend container so the new code is loaded'
        docker compose stop backend | Out-Host
    }
} finally {
    Pop-Location
}

Assert-PortFree -Port 8000
Stop-DemoFrontend -FrontendRepo $FrontendRepo
Assert-PortFree -Port 5174

$allowed = 'http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173'
$env:ALLOWED_ORIGINS = $allowed
$env:OFFLINE_DEMO_MODE = if ($Offline) { 'true' } else { 'false' }

if ($Offline) {
    $env:GEMINI_API_KEY = ''
} else {
    # Keep the key from the repo-local .env without printing or committing it.
    $envFile = Join-Path $BackendRepo '.env'
    if (Test-Path $envFile) {
        $keyLine = Get-Content $envFile | Where-Object { $_ -match '^\s*GEMINI_API_KEY=(.*)$' } | Select-Object -Last 1
        if ($keyLine -and $Matches[1]) {
            $env:GEMINI_API_KEY = $Matches[1].Trim().Trim('"')
        }
    }
}

Write-Host "Starting dockerised backend from $BackendRepo (OFFLINE_DEMO_MODE=$($env:OFFLINE_DEMO_MODE))"
Push-Location $BackendRepo
try {
    docker compose up -d --force-recreate backend
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
} finally {
    Pop-Location
}

$health = $null
for ($i = 0; $i -lt 60; $i += 1) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8000/health' -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            $candidate = $response.Content | ConvertFrom-Json
            if ($candidate.status -eq 'healthy') {
                $health = $candidate
                Write-Host "OK backend healthy after ${i}s"
                break
            }
        }
    } catch {
        # backend is still starting
    }
    Start-Sleep -Seconds 1
}
if (-not $health) { throw 'Backend /health did not become healthy within 60s' }

$env:VITE_API_BASE_URL = 'http://localhost:8000'
$env:VITE_USE_MOCKS = 'false'
# Every domain must be real in the demo: a mocked documents endpoint would show
# a fake "uploaded" toast while the backend never received the PDF.
$env:VITE_MOCK_AUTH = 'false'
$env:VITE_MOCK_QUESTIONS = 'false'
$env:VITE_MOCK_ATTEMPTS = 'false'
$env:VITE_MOCK_DOCUMENTS = 'false'
$env:VITE_MOCK_PROFILE_GOAL = 'false'
$env:VITE_MOCK_NEXT_PARAMS = 'false'
$env:VITE_MOCK_PROFILE = 'false'
$env:VITE_MOCK_HISTORY = 'false'
# There is no backend catalog/content router; these two are static UI fixtures,
# not learner data, and must stay local to avoid 404s on course navigation.
$env:VITE_MOCK_CATALOG = 'true'
$env:VITE_MOCK_CONTENT = 'true'
$logDir = Join-Path $env:TEMP 'querymind-demo'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$outLog = Join-Path $logDir 'frontend.out.log'
$errLog = Join-Path $logDir 'frontend.err.log'

Write-Host "Starting frontend from $FrontendRepo\frontend on pinned port 5174"
$frontend = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'dev', '--', '--port', '5174', '--strictPort') `
    -WorkingDirectory (Join-Path $FrontendRepo 'frontend') `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

$frontendReady = $false
for ($i = 0; $i -lt 60; $i += 1) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:5174' -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            $frontendReady = $true
            Write-Host "OK frontend ready after ${i}s (PID $($frontend.Id))"
            break
        }
    } catch {
        # vite is still starting
    }
    Start-Sleep -Seconds 1
}
if (-not $frontendReady) {
    Get-Content $errLog -Tail 40
    throw "Frontend did not become ready within 60s (PID $($frontend.Id))"
}

Write-Host ''
Write-Host 'DEMO READY'
Write-Host "  Frontend: http://localhost:5174 (also http://127.0.0.1:5174)"
Write-Host '  Backend:  http://localhost:8000'
Write-Host "  Health:   $($health | ConvertTo-Json -Compress)"
Write-Host "  Frontend PID: $($frontend.Id)"
Write-Host "  Frontend logs: $outLog / $errLog"
