$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $projectDir "desktop\DeepSeekWidgetHost.cs"
$output = Join-Path $projectDir "desktop\DeepSeekWidgetHost.exe"
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$packageRoot = Join-Path $projectDir "vendor\webview2-1.0.4258.31"
$managedRoot = Join-Path $packageRoot "lib\net462"
$nativeRoot = Join-Path $packageRoot "runtimes\win-x64\native"
$coreDll = Join-Path $managedRoot "Microsoft.Web.WebView2.Core.dll"
$winFormsDll = Join-Path $managedRoot "Microsoft.Web.WebView2.WinForms.dll"
$loaderDll = Join-Path $nativeRoot "WebView2Loader.dll"

if (-not (Test-Path -LiteralPath $coreDll)) {
  & (Join-Path $projectDir "scripts\restore-webview2.ps1")
}

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "找不到 Windows .NET Framework 编译器 csc.exe"
}
if (-not (Test-Path -LiteralPath $coreDll) -or -not (Test-Path -LiteralPath $winFormsDll)) {
  throw "找不到 WebView2 托管程序集，请先恢复 vendor/webview2-1.0.4258.31"
}

Copy-Item -LiteralPath $coreDll -Destination (Join-Path $projectDir "desktop\Microsoft.Web.WebView2.Core.dll") -Force
Copy-Item -LiteralPath $winFormsDll -Destination (Join-Path $projectDir "desktop\Microsoft.Web.WebView2.WinForms.dll") -Force
Copy-Item -LiteralPath $loaderDll -Destination (Join-Path $projectDir "desktop\WebView2Loader.dll") -Force

& $compiler `
  /nologo `
  /target:winexe `
  /platform:x64 `
  /optimize+ `
  /out:"$output" `
  /r:System.dll `
  /r:System.Core.dll `
  /r:System.Drawing.dll `
  /r:System.Windows.Forms.dll `
  "/r:$coreDll" `
  "/r:$winFormsDll" `
  "$source"

if ($LASTEXITCODE -ne 0) {
  throw "WebView2 桌面窗口编译失败"
}

Write-Host "Built: $output"
