param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "SilentlyContinue"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:4173"
$sessionId = ""
$transcriptPath = ""

if ([Console]::IsInputRedirected) {
  $payloadText = [Console]::In.ReadToEnd()
  if ($payloadText) {
    try {
      $payload = $payloadText | ConvertFrom-Json
      if ($payload.session_id) {
        $sessionId = [string]$payload.session_id
      }
      if ($payload.transcript_path) {
        $transcriptPath = [string]$payload.transcript_path
      }
    } catch {
      # The launcher still works without hook metadata.
    }
  }
}

function Test-Dashboard {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Dashboard)) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    exit 1
  }

  $logDir = Join-Path $projectDir "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Start-Process `
    -FilePath $node.Source `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "server.out.log") `
    -RedirectStandardError (Join-Path $logDir "server.err.log") | Out-Null

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 200
    if (Test-Dashboard) {
      break
    }
  }
}

if ($transcriptPath) {
  for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
    if (Test-Path -LiteralPath $transcriptPath) {
      break
    }
    Start-Sleep -Milliseconds 200
  }
} else {
  Start-Sleep -Milliseconds 700
}

if ($NoBrowser) {
  exit 0
}

$trayExe = Join-Path $projectDir "DeepSeekUsageTray.exe"
if (-not (Test-Path -LiteralPath $trayExe)) {
  exit 1
}

Start-Process `
  -FilePath $trayExe `
  -ArgumentList "--show" `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden | Out-Null
