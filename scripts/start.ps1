$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $PSScriptRoot "build.ps1"
$localNodeDir = Join-Path $projectRoot "tools\node-runtime"
$localNode = Join-Path $localNodeDir "node.exe"
$serverScript = Join-Path $PSScriptRoot "serve.mjs"
$defaultPort = if ($env:CHATGPT_BROWSER_PORT) { $env:CHATGPT_BROWSER_PORT } else { "4173" }
$startPage = if ($env:CHATGPT_BROWSER_PAGE) { $env:CHATGPT_BROWSER_PAGE } else { "app/index.html" }

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

$resolvedPort = $defaultPort
try {
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    $connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalAddress -eq "127.0.0.1" -or $_.LocalAddress -eq "::1" } |
      Sort-Object LocalPort

    foreach ($connection in $connections) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($connection.LocalPort)/$startPage" -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
          $resolvedPort = $connection.LocalPort
          break
        }
      } catch {
        # Keep probing until the server is actually ready.
      }
    }

    if ($resolvedPort -ne $defaultPort) {
      break
    }

    Start-Sleep -Milliseconds 250
  }
} catch {
  # If port detection fails, fall back to the requested port and let the user know below.
}

$url = "http://127.0.0.1:$resolvedPort/$startPage"
Write-Host "ChatGPT Backup Browser is starting at $url"
Write-Host "Server process id: $($serverProcess.Id)"
Start-Process $url | Out-Null
