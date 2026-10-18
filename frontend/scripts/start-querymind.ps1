<#
  start-querymind.ps1 — start the project, the whole thing, in one go.

  What it does, in order:
    1. checks node and npm are there
    2. installs the frontend dependencies if node_modules is missing
    3. starts the backend, the database and the vector store with Docker, but only
       when Docker is actually running (or when asked with -Mode full)
    4. waits for the API to answer on /health, then for the app to answer on its port
    5. starts the Vite dev server in its own window so you can watch it or Ctrl+C it
    6. opens the app in your browser
    7. tells you how to stop everything again

  Without Docker it still works: the frontend serves its catalog, content,
  questions, attempts, profile and history from the mocks, and sign-in is mocked
  too, so any email and password gets you in. That is the default here.

  Use:
    .\start-querymind.cmd                      # decide by itself (this is the shortcut)
    .\start-querymind.cmd -Mode full           # insist on the backend, fail if Docker is off
    .\start-querymind.cmd -StartDocker         # let it bring Docker Desktop up first
    .\start-querymind.cmd -Mode frontend       # skip Docker entirely
    .\start-querymind.cmd -Port 5174           # somewhere else than 5173
    .\start-querymind.cmd -NoBrowser           # do not open a browser
    .\start-querymind.cmd -Stop                # stop the dev server and the containers
#>

[CmdletBinding()]
param(
  [ValidateSet('auto', 'frontend', 'full')]
  [string]$Mode = 'auto',

  [int]$Port = 5173,

  [switch]$NoBrowser,

  [switch]$StartDocker,

  [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$frontendDir = Split-Path -Parent $PSScriptRoot
$rootDir = Split-Path -Parent $frontendDir
$composeFile = Join-Path $rootDir 'docker-compose.yml'
$starter = Join-Path $frontendDir 'start-querymind.cmd'

$apiUrl = 'http://localhost:8000'
$appUrl = "http://localhost:$Port"

function Say { param([string]$Text) Write-Host $Text }
function Step { param([string]$Text) Write-Host ''; Write-Host $Text -ForegroundColor Cyan }
function Ok { param([string]$Text) Write-Host "   $Text" -ForegroundColor Green }
function Warn { param([string]$Text) Write-Host "   $Text" -ForegroundColor Yellow }
function Fail { param([string]$Text) Write-Host "   $Text" -ForegroundColor Red }

function Test-Url {
  param([string]$Url, [int]$TimeoutSec = 2)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-Url {
  param([string]$Url, [int]$TimeoutSec = 120)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url -Url $Url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Test-DockerRunning {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }

  # Docker Desktop publishes these pipes only while its engine is up, and that
  # check costs nothing. The CLI itself must not be asked first: with Docker
  # Desktop closed, `docker info` waits minutes for an engine that is not coming.
  $pipeUp = $false
  foreach ($pipe in '\\.\pipe\dockerDesktopLinuxEngine', '\\.\pipe\docker_engine') {
    if (Test-Path $pipe) { $pipeUp = $true }
  }
  if (-not $pipeUp) { return $false }

  # A stale pipe is possible, so ask the daemon too, but never wait long for it.
  $outFile = Join-Path $env:TEMP 'qm-docker-probe.out'
  $errFile = Join-Path $env:TEMP 'qm-docker-probe.err'
  try {
    $probe = Start-Process -FilePath 'docker' -ArgumentList 'info', '--format', '{{.ServerVersion}}' `
      -PassThru -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $probe.WaitForExit(10000)) {
      Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue
      return $false
    }
    return ($probe.ExitCode -eq 0)
  } catch {
    return $false
  } finally {
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-PortsProcess {
  param([int]$PortNumber)
  $connections = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) { return @() }
  return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Start-DockerDesktop {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
  )
  $exe = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $exe) {
    Fail 'Docker Desktop is not installed anywhere I can see.'
    return $false
  }
  Say '   starting Docker Desktop ...'
  Start-Process -FilePath $exe | Out-Null
  return $true
}

# ── stop ─────────────────────────────────────────────────────
if ($Stop) {
  Step 'Stopping QueryMind'

  $listening = @(Get-PortsProcess -PortNumber $Port)
  foreach ($processId in $listening) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Ok "stopped the dev server on port $Port (process $processId)"
  }
  if ($listening.Count -eq 0) { Ok "nothing was listening on port $Port" }

  # The dev server runs in its own window; close that window too, so no stray
  # prompt is left behind with a dead npm in its history.
  $windows = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
    Where-Object { $_.CommandLine -like "*npm run dev*--port $Port*" }
  foreach ($window in $windows) {
    Stop-Process -Id $window.ProcessId -Force -ErrorAction SilentlyContinue
    Ok 'closed the frontend window'
  }

  if ((Test-Path $composeFile) -and (Test-DockerRunning)) {
    & docker compose -f $composeFile down
    if ($LASTEXITCODE -eq 0) { Ok 'stopped the backend, database and vector store' }
    else { Warn 'docker compose down did not finish cleanly; see the output above' }
  } else {
    Warn 'Docker is not running, so there were no containers to stop.'
  }

  Say ''
  return
}

# ── what is on this machine ──────────────────────────────────
Step 'Checking what you have'

foreach ($command in 'node', 'npm') {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    Fail "$command is not on PATH. Install Node.js from https://nodejs.org and run this again."
    exit 1
  }
}
Ok "node $(node --version), npm $(npm --version)"

$hasCompose = Test-Path $composeFile
if (-not $hasCompose) { Warn "no docker-compose.yml in $rootDir, so the backend cannot be started from here." }

$dockerRunning = Test-DockerRunning
if ($dockerRunning) { Ok 'Docker is running' } else { Warn 'Docker is not running' }

# Only if asked: Docker Desktop takes minutes to come up, so it is never started
# behind your back.
if ($StartDocker -and -not $dockerRunning) {
  if (Start-DockerDesktop) {
    Say '   waiting for the engine, up to three minutes ...'
    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline -and -not $dockerRunning) {
      Start-Sleep -Seconds 5
      $dockerRunning = Test-DockerRunning
    }
    if ($dockerRunning) { Ok 'Docker is up' } else { Warn 'Docker has not come up in three minutes.' }
  }
}

$useBackend = $false
if ($Mode -eq 'full') { $useBackend = $true }
elseif ($Mode -eq 'frontend') { $useBackend = $false }
else { $useBackend = ($dockerRunning -and $hasCompose) }

if ($useBackend -and -not $dockerRunning) {
  Fail 'The full stack needs Docker and Docker is not answering.'
  Fail 'Start Docker Desktop, or add -StartDocker to let this do it, or use -Mode frontend.'
  exit 1
}

# ── frontend dependencies ────────────────────────────────────
Step 'Frontend dependencies'

if (Test-Path (Join-Path $frontendDir 'node_modules')) {
  Ok 'node_modules is already there'
} else {
  Say '   npm install, first run, this takes a minute'
  Push-Location $frontendDir
  try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
  Ok 'installed'
}

# ── backend, database, vector store ──────────────────────────
if ($useBackend) {
  Step 'Backend, database and vector store (Docker)'

  $envFile = Join-Path $rootDir '.env'
  if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $rootDir '.env.example') $envFile
    Warn 'created .env from .env.example — add your GEMINI_API_KEY if you want generated questions'
  }

  Say '   docker compose up -d (the first run builds the image)'
  & docker compose -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) {
    Fail 'docker compose up failed; the output above says why.'
    exit 1
  }

  Say '   waiting for the API on /health ...'
  if (Wait-Url -Url "$apiUrl/health" -TimeoutSec 240) { Ok "$apiUrl/health is up" }
  else { Warn 'the API has not answered within four minutes; starting the frontend anyway.' }
} else {
  Step 'Backend: skipped'
  Warn 'frontend only. The catalog, content, questions, attempts, profile and history come from'
  Warn 'the mocks, and sign-in is mocked, so any email and password works.'
}

# ── the app itself ───────────────────────────────────────────
Step "Frontend on $appUrl"

if (Test-Url -Url $appUrl) {
  Ok 'something is already serving that port, leaving it alone'
} else {
  # The dev server inherits this window's environment.
  if ($useBackend) { $env:VITE_MOCK_AUTH = 'false' } else { $env:VITE_MOCK_AUTH = 'true' }
  $env:VITE_API_BASE_URL = $apiUrl

  $devCommand = "title QueryMind frontend && npm run dev -- --port $Port --strictPort"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $devCommand -WorkingDirectory $frontendDir

  Say '   waiting for the dev server ...'
  if (Wait-Url -Url $appUrl -TimeoutSec 120) { Ok "the app is answering on $appUrl" }
  else { Warn 'the dev server has not answered yet — the window that opened will say why.' }
}

if (-not $NoBrowser) {
  Start-Process $appUrl
  Ok "opened $appUrl in your browser"
}

# ── where everything is ──────────────────────────────────────
Step 'Ready'
Say "   App        $appUrl"
if ($useBackend) {
  Say "   API        $apiUrl   (docs at $apiUrl/docs)"
  Say '   ChromaDB   http://localhost:8001'
} else {
  Say '   Sign in    any email and password, the auth is mocked'
}
Say '   The frontend runs in its own window. Press Ctrl+C there, or close it, to stop it.'
Say "   To stop everything:  `"$starter`" -Stop"
Say ''
