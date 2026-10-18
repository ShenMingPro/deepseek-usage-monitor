$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source

Write-Host "Checking JavaScript syntax..."
foreach ($script in @("server.js", "app.js", "widget-mode.js")) {
  & $node --check (Join-Path $projectDir $script)
  if ($LASTEXITCODE -ne 0) {
    throw "JavaScript syntax check failed: $script"
  }
}

Write-Host "Checking PowerShell syntax..."
$scriptFiles = Get-ChildItem -Path $projectDir -Filter "*.ps1" -File -Recurse |
  Where-Object {
    $_.FullName -notmatch "[\\/](vendor|node_modules|release|artifacts)[\\/]"
  }
foreach ($script in $scriptFiles) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $script.FullName,
    [ref]$tokens,
    [ref]$errors
  ) | Out-Null
  if ($errors.Count -gt 0) {
    $messages = ($errors | ForEach-Object { $_.Message }) -join "; "
    throw "PowerShell syntax check failed: $($script.FullName): $messages"
  }
}

& (Join-Path $PSScriptRoot "build-all.ps1")

Write-Host "Starting a local smoke test..."
$smokePort = Get-Random -Minimum 4280 -Maximum 4380
$smokeLog = Join-Path $env:TEMP "deepseek-usage-monitor-smoke-$smokePort.log"
$smokeError = Join-Path $env:TEMP "deepseek-usage-monitor-smoke-$smokePort.err.log"
$previousPort = $env:PORT
$env:PORT = [string]$smokePort
$serverProcess = $null

try {
  $serverProcess = Start-Process `
    -FilePath $node `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $smokeLog `
    -RedirectStandardError $smokeError `
    -PassThru

  $healthy = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 150
    try {
      $response = Invoke-RestMethod `
        -Uri "http://127.0.0.1:$smokePort/api/health" `
        -TimeoutSec 2
      if ($response.ok) {
        $healthy = $true
        break
      }
    } catch {
      # The server may still be starting.
    }
  }

  if (-not $healthy) {
    throw "Local service did not become healthy on port $smokePort."
  }
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
  $env:PORT = $previousPort
  Remove-Item -LiteralPath $smokeLog -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $smokeError -Force -ErrorAction SilentlyContinue
}

Write-Host "Verification completed successfully."

