$ErrorActionPreference = "SilentlyContinue"

if (-not [Console]::IsInputRedirected) {
  exit 0
}

$payloadText = [Console]::In.ReadToEnd()
if (-not $payloadText) {
  exit 0
}

try {
  $payload = $payloadText | ConvertFrom-Json
} catch {
  exit 0
}

$body = [ordered]@{
  sessionId = [string]$payload.session_id
  transcriptPath = [string]$payload.transcript_path
  event = [string]$payload.hook_event_name
  cwd = [string]$payload.cwd
} | ConvertTo-Json -Compress

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:4173/api/active-session" `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 2 | Out-Null
} catch {
}

exit 0
