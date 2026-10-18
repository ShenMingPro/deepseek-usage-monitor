$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$version = "1.0.4258.31"
$expectedSha256 = "56F7F4B8BF9AEE4B8EFEFBBDD4F67D5F74EBD1B100ED0806DA71BF76AF481AA9"
$vendorDir = Join-Path $projectDir "vendor"
$packageRoot = Join-Path $vendorDir "webview2-$version"
$packageFile = Join-Path $vendorDir "Microsoft.Web.WebView2.$version.nupkg"
$coreDll = Join-Path $packageRoot "lib\net462\Microsoft.Web.WebView2.Core.dll"
$downloadUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg"

if (Test-Path -LiteralPath $coreDll) {
  Write-Host "WebView2 SDK $version is already available."
  exit 0
}

New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

if (-not (Test-Path -LiteralPath $packageFile)) {
  $tempPackage = Join-Path $vendorDir "webview2-download-$version.nupkg"
  Write-Host "Downloading Microsoft WebView2 SDK $version..."
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPackage -UseBasicParsing
    Move-Item -LiteralPath $tempPackage -Destination $packageFile
  } finally {
    if (Test-Path -LiteralPath $tempPackage) {
      Remove-Item -LiteralPath $tempPackage -Force
    }
  }
}

$actualSha256 = (Get-FileHash -LiteralPath $packageFile -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) {
  throw "WebView2 SDK checksum mismatch. Expected $expectedSha256, got $actualSha256."
}

if (Test-Path -LiteralPath $packageRoot) {
  $resolvedVendor = [System.IO.Path]::GetFullPath($vendorDir)
  $resolvedTarget = [System.IO.Path]::GetFullPath($packageRoot)
  if (-not $resolvedTarget.StartsWith(
    $resolvedVendor + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Refusing to replace a package directory outside vendor/."
  }
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

Write-Host "Extracting Microsoft WebView2 SDK $version..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($packageFile, $packageRoot)

if (-not (Test-Path -LiteralPath $coreDll)) {
  throw "WebView2 SDK extraction did not produce the expected files."
}

Write-Host "WebView2 SDK is ready at $packageRoot"

