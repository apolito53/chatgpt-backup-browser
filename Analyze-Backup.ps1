param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("summary", "find", "image-refs", "extract-json")]
  [string]$Command,

  [Parameter(Position = 1)]
  [string]$Path,

  [Parameter(Position = 2)]
  [string]$Pattern,

  [int]$MaxMatches = 20,

  [int]$ContextLines = 2,

  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-InputPath {
  param([string]$CandidatePath)

  if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
    throw "A path is required for this command."
  }

  $resolved = Resolve-Path -LiteralPath $CandidatePath
  return $resolved.Path
}

function Get-ExportFormat {
  param([string]$ResolvedPath)

  $extension = [IO.Path]::GetExtension($ResolvedPath).ToLowerInvariant()
  if ($extension -eq ".html" -or $extension -eq ".htm") {
    return "html"
  }
  if ($extension -eq ".json") {
    return "json"
  }
  return "unknown"
}

function Get-FileSummary {
  param([string]$ResolvedPath)

  $item = Get-Item -LiteralPath $ResolvedPath
  $format = Get-ExportFormat -ResolvedPath $ResolvedPath

  $patternMap = [ordered]@{
    Conversations = '"title"\s*:'
    Messages      = '"message"\s*:'
    FileIds       = '"file_id"\s*:'
    AssetPointers = '"asset_pointer"\s*:'
    Attachments   = '"attachments"\s*:'
    ContentTypes  = '"content_type"\s*:'
  }

  $counts = [ordered]@{}
  foreach ($entry in $patternMap.GetEnumerator()) {
    $matchCount = ([regex]::Matches((Get-Content -LiteralPath $ResolvedPath -Raw), $entry.Value)).Count
    $counts[$entry.Key] = $matchCount
  }

  [pscustomobject]@{
    Path            = $ResolvedPath
    Format          = $format
    SizeMB          = [math]::Round($item.Length / 1MB, 2)
    LastWriteTime   = $item.LastWriteTime
    Conversations   = $counts.Conversations
    Messages        = $counts.Messages
    FileIds         = $counts.FileIds
    AssetPointers   = $counts.AssetPointers
    Attachments     = $counts.Attachments
    ContentTypes    = $counts.ContentTypes
  }
}

function Find-InBackup {
  param(
    [string]$ResolvedPath,
    [string]$SearchPattern,
    [int]$MaxResultCount,
    [int]$Context
  )

  if ([string]::IsNullOrWhiteSpace($SearchPattern)) {
    throw "A pattern is required for the find command."
  }

  $regex = [regex]::new($SearchPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $raw = [System.IO.File]::ReadAllText($ResolvedPath)
  $matches = $regex.Matches($raw)
  $results = New-Object System.Collections.Generic.List[object]
  $excerptRadius = [Math]::Max(200, $Context * 160)

  for ($i = 0; $i -lt [Math]::Min($matches.Count, $MaxResultCount); $i++) {
    $match = $matches[$i]
    $start = [Math]::Max(0, $match.Index - $excerptRadius)
    $end = [Math]::Min($raw.Length, $match.Index + $match.Length + $excerptRadius)
    $excerpt = $raw.Substring($start, $end - $start)
    $excerpt = $excerpt -replace '\s+', ' '

    $results.Add([pscustomobject]@{
      MatchNumber = $i + 1
      Index       = $match.Index
      Match       = $match.Value
      Excerpt     = $excerpt.Trim()
    }) | Out-Null
  }

  $results
}

function Find-ImageReferences {
  param(
    [string]$ResolvedPath,
    [int]$MaxResultCount,
    [int]$Context
  )

  $imagePattern = '"asset_pointer"|"file_id"|"attachments"|"image"|"filename"|"url"|"content_type"\s*:\s*"image'
  Find-InBackup -ResolvedPath $ResolvedPath -SearchPattern $imagePattern -MaxResultCount $MaxResultCount -Context $Context
}

function Extract-EmbeddedJson {
  param(
    [string]$ResolvedPath,
    [string]$DestinationPath
  )

  $raw = Get-Content -LiteralPath $ResolvedPath -Raw
  $marker = "var jsonData = "
  $start = $raw.IndexOf($marker)
  if ($start -lt 0) {
    throw "Could not find embedded jsonData payload in $ResolvedPath"
  }

  $dataStart = $start + $marker.Length
  $end = $raw.IndexOf("</script>", $dataStart)
  if ($end -lt 0) {
    throw "Could not find closing </script> tag in $ResolvedPath"
  }

  $payload = $raw.Substring($dataStart, $end - $dataStart).Trim()
  if ($payload.EndsWith(";")) {
    $payload = $payload.Substring(0, $payload.Length - 1).Trim()
  }

  if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
    $baseName = [IO.Path]::GetFileNameWithoutExtension($ResolvedPath)
    $DestinationPath = Join-Path -Path ([IO.Path]::GetDirectoryName($ResolvedPath)) -ChildPath "$baseName.extracted.json"
  }

  [IO.File]::WriteAllText($DestinationPath, $payload)

  [pscustomobject]@{
    SourcePath = $ResolvedPath
    OutputPath = $DestinationPath
    SizeMB     = [math]::Round(((Get-Item -LiteralPath $DestinationPath).Length / 1MB), 2)
  }
}

switch ($Command) {
  "summary" {
    $resolvedPath = Resolve-InputPath -CandidatePath $Path
    Get-FileSummary -ResolvedPath $resolvedPath | Format-List
  }
  "find" {
    $resolvedPath = Resolve-InputPath -CandidatePath $Path
    Find-InBackup -ResolvedPath $resolvedPath -SearchPattern $Pattern -MaxResultCount $MaxMatches -Context $ContextLines |
      Format-List
  }
  "image-refs" {
    $resolvedPath = Resolve-InputPath -CandidatePath $Path
    Find-ImageReferences -ResolvedPath $resolvedPath -MaxResultCount $MaxMatches -Context $ContextLines |
      Format-List
  }
  "extract-json" {
    $resolvedPath = Resolve-InputPath -CandidatePath $Path
    Extract-EmbeddedJson -ResolvedPath $resolvedPath -DestinationPath $OutputPath | Format-List
  }
}
