$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "restore-webview2.ps1")
& (Join-Path $projectDir "build-tray.ps1")
& (Join-Path $projectDir "build-widget-host.ps1")
& (Join-Path $projectDir "build-launcher.ps1")

Write-Host "All Windows desktop components were built successfully."

