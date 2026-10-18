$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectDir "package.json") -Raw |
  ConvertFrom-Json
$version = [string]$package.version
$releaseRoot = Join-Path $projectDir "release"
$stageName = "deepseek-usage-monitor-$version-win-x64"
$stageDir = Join-Path $releaseRoot $stageName
$zipPath = Join-Path $releaseRoot "$stageName.zip"

& (Join-Path $PSScriptRoot "build-all.ps1")

$resolvedReleaseRoot = [System.IO.Path]::GetFullPath($releaseRoot)
$resolvedStageDir = [System.IO.Path]::GetFullPath($stageDir)
if (-not $resolvedStageDir.StartsWith(
  $resolvedReleaseRoot + [System.IO.Path]::DirectorySeparatorChar,
  [System.StringComparison]::OrdinalIgnoreCase
)) {
  throw "Refusing to prepare a release directory outside release/."
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

$files = @(
  "app.js",
  "index.html",
  "styles.css",
  "widget-mode.js",
  "server.js",
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md",
  "Start Monitor.cmd",
  "open-dashboard.ps1",
  "set-active-session.ps1",
  "widget-window.ps1",
  "install-desktop-shortcut.ps1",
  "DeepSeekUsageTray.exe",
  "DeepSeekLauncher.exe",
  "favicon.svg"
)

foreach ($file in $files) {
  $source = Join-Path $projectDir $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing release file: $file"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageDir $file)
}

$directories = @("assets", "docs", "third_party\webview2")
foreach ($directory in $directories) {
  $source = Join-Path $projectDir $directory
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing release directory: $directory"
  }
  $destination = Join-Path $stageDir $directory
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force
}

$desktopBinaries = @(
  "DeepSeekWidgetHost.exe",
  "Microsoft.Web.WebView2.Core.dll",
  "Microsoft.Web.WebView2.WinForms.dll",
  "WebView2Loader.dll"
)
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "desktop") | Out-Null
foreach ($file in $desktopBinaries) {
  $source = Join-Path $projectDir "desktop\$file"
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing desktop binary: $file"
  }
  $destination = Join-Path $stageDir "desktop\$file"
  Copy-Item -LiteralPath $source -Destination $destination
}

Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host "Release package: $zipPath ($zipSize MB)"

