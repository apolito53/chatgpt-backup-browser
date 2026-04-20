$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $PSScriptRoot "build.ps1"
$localNodeDir = Join-Path $projectRoot "tools\node-runtime"
$localNode = Join-Path $localNodeDir "node.exe"
$serverScript = Join-Path $PSScriptRoot "serve.mjs"
$defaultPort = if ($env:CHATGPT_BROWSER_PORT) { $env:CHATGPT_BROWSER_PORT } else { "4173" }
$startPage = if ($env:CHATGPT_BROWSER_PAGE) { $env:CHATGPT_BROWSER_PAGE } else { "index.html" }

if (Test-Path $buildScript) {
  & powershell -ExecutionPolicy Bypass -File $buildScript
}

if (-not (Test-Path $localNode)) {
  New-Item -ItemType Directory -Force -Path $localNodeDir | Out-Null

  $resolvedNode = (Get-Command node -ErrorAction Stop).Source
  if ($resolvedNode -like "*WindowsApps*") {
    Copy-Item $resolvedNode $localNode -Force
  } else {
    $localNode = $resolvedNode
  }
}

$arguments = @($serverScript)
$serverProcess = Start-Process -FilePath $localNode -ArgumentList $arguments -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden

Start-Sleep -Milliseconds 900

$resolvedPort = $defaultPort
try {
  $connection = Get-NetTCPConnection -State Listen -OwningProcess $serverProcess.Id -ErrorAction Stop |
    Sort-Object LocalPort |
    Select-Object -First 1
  if ($connection) {
    $resolvedPort = $connection.LocalPort
  }
} catch {
  # If port detection fails, fall back to the requested port and let the user know below.
}

$url = "http://127.0.0.1:$resolvedPort/$startPage"
Write-Host "ChatGPT Backup Browser is starting at $url"
Write-Host "Server process id: $($serverProcess.Id)"
Start-Process $url | Out-Null
