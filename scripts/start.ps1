$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $PSScriptRoot "build.ps1"
$localNodeDir = Join-Path $projectRoot "tools\node-runtime"
$localNode = Join-Path $localNodeDir "node.exe"
$serverScript = Join-Path $PSScriptRoot "serve.mjs"
$defaultPort = if ($env:CHATGPT_BROWSER_PORT) { $env:CHATGPT_BROWSER_PORT } else { "4173" }
$startPage = if ($env:CHATGPT_BROWSER_PAGE) { $env:CHATGPT_BROWSER_PAGE } else { "app/index.html" }
$healthPath = "__chatgpt_backup_browser_health"

$requestedPort = 4173
if (-not [int]::TryParse([string]$defaultPort, [ref]$requestedPort)) {
  $requestedPort = 4173
}
if ($requestedPort -lt 1 -or $requestedPort -gt 65535) {
  $requestedPort = 4173
}

function Test-BuildRequired {
  if (-not (Test-Path $buildScript)) {
    return $false
  }

  $sourceFiles = @(
    Get-ChildItem -Path (Join-Path $projectRoot 'src') -Recurse -File -Include *.ts,*.d.ts -ErrorAction SilentlyContinue
  ) + @(
    Get-Item -LiteralPath (Join-Path $projectRoot 'tsconfig.json') -ErrorAction SilentlyContinue
  ) + @(
    Get-Item -LiteralPath (Join-Path $projectRoot 'jsconfig.json') -ErrorAction SilentlyContinue
  ) | Where-Object { $_ }

  if (-not $sourceFiles.Count) {
    return $false
  }

  $builtFiles = Get-ChildItem -Path (Join-Path $projectRoot 'app') -Recurse -File -Filter *.js -ErrorAction SilentlyContinue
  if (-not $builtFiles.Count) {
    return $true
  }

  $latestSource = ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
  $latestBuild = ($builtFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
  return $latestSource -gt $latestBuild
}

if (Test-BuildRequired) {
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

$serverToken = [guid]::NewGuid().ToString("N")
$previousServerToken = $env:CHATGPT_BROWSER_SERVER_TOKEN
$env:CHATGPT_BROWSER_SERVER_TOKEN = $serverToken

try {
  $arguments = @($serverScript)
  $serverProcess = Start-Process -FilePath $localNode -ArgumentList $arguments -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
} finally {
  if ($null -eq $previousServerToken) {
    Remove-Item Env:\CHATGPT_BROWSER_SERVER_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:CHATGPT_BROWSER_SERVER_TOKEN = $previousServerToken
  }
}

$resolvedPort = $requestedPort
$serverReady = $false
try {
  $maxPort = [Math]::Min(65535, $requestedPort + 50)
  $portsToProbe = $requestedPort..$maxPort

  for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
    foreach ($port in $portsToProbe) {
      try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/$healthPath" -UseBasicParsing -TimeoutSec 1
        $health = $response.Content | ConvertFrom-Json
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400 -and
            $health.app -eq "chatgpt-backup-browser" -and
            $health.projectRoot -eq $projectRoot -and
            $health.token -eq $serverToken) {
          $resolvedPort = $port
          $serverReady = $true
          break
        }
      } catch {
        # Keep probing only for this app's private health marker.
      }
    }

    if ($serverReady) {
      break
    }

    Start-Sleep -Milliseconds 250
  }
} catch {
  # If port detection fails, fall back to the requested port and let the user know below.
}

if (-not $serverReady) {
  $message = "ChatGPT Backup Browser started, but the launcher could not confirm its own local server. Another localhost app may be using port $requestedPort. Close the other server or set CHATGPT_BROWSER_PORT to a free port, then try START_BROWSER again."
  Write-Warning $message
  try {
    (New-Object -ComObject WScript.Shell).Popup($message, 12, "ChatGPT Backup Browser", 48) | Out-Null
  } catch {
    # Hidden launchers may not have an interactive shell available for the popup.
  }
  exit 1
}

$url = "http://127.0.0.1:$resolvedPort/$startPage"
Write-Host "ChatGPT Backup Browser is starting at $url"
Write-Host "Server process id: $($serverProcess.Id)"
Start-Process $url | Out-Null
