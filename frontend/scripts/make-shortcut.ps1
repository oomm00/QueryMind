<#
  make-shortcut.ps1 — put a QueryMind shortcut on your Desktop, run it once.

  Windows will not let a launcher write a .lnk for you from a background
  session, so this is the one step you run yourself. It only writes two files:
  the shortcut, and nothing else.

  Use:
    .\make-shortcut.ps1                 # Desktop only
    .\make-shortcut.ps1 -StartMenu      # Desktop and the Start Menu
    .\make-shortcut.ps1 -Remove         # take them away again
#>

[CmdletBinding()]
param(
  [switch]$StartMenu,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$frontendDir = Split-Path -Parent $PSScriptRoot
$target = Join-Path $frontendDir 'start-querymind.cmd'

$places = @()
$places += Join-Path ([Environment]::GetFolderPath('Desktop')) 'QueryMind.lnk'
if ($StartMenu) {
  $places += Join-Path ([Environment]::GetFolderPath('Programs')) 'QueryMind.lnk'
}

if ($Remove) {
  foreach ($place in $places) {
    if (Test-Path $place) { Remove-Item $place -Force; Write-Host "removed $place" }
  }
  exit 0
}

if (-not (Test-Path $target)) {
  Write-Host "cannot find $target" -ForegroundColor Red
  exit 1
}

$shell = New-Object -ComObject WScript.Shell

foreach ($place in $places) {
  $link = $shell.CreateShortcut($place)
  $link.TargetPath = $target
  $link.WorkingDirectory = $frontendDir
  $link.Description = 'Start QueryMind: the backend with Docker if it is running, the app in your browser'
  $link.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
  $link.WindowStyle = 1
  $link.Save()
  Write-Host "created $place" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Double-click it any time. It is the same as running:'
Write-Host "  `"$target`""
