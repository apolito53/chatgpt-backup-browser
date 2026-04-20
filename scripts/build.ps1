$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localNodeDir = Join-Path $projectRoot "tools\node-runtime"
$localNode = Join-Path $localNodeDir "node.exe"
$typescriptCli = Join-Path $projectRoot "tools\typescript\package\lib\tsc.js"
$buildDir = Join-Path $projectRoot ".tsbuild"

if (-not (Test-Path $typescriptCli)) {
  throw "TypeScript compiler not found at $typescriptCli"
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

Push-Location $projectRoot
try {
  if (Test-Path $buildDir) {
    Remove-Item $buildDir -Recurse -Force
  }

  & $localNode $typescriptCli -p tsconfig.json

  Get-ChildItem -Path $buildDir -Filter *.js -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($buildDir.Length).TrimStart('\')
    $targetPath = Join-Path $projectRoot $relativePath
    $targetDir = Split-Path -Parent $targetPath
    if (-not (Test-Path $targetDir)) {
      New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    }
    Copy-Item $_.FullName $targetPath -Force
  }
} finally {
  Pop-Location
}
