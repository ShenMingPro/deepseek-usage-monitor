$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $projectDir "launcher\DeepSeekLauncher.cs"
$output = Join-Path $projectDir "DeepSeekLauncher.exe"
$icon = Join-Path $projectDir "assets\deepseek-launcher.ico"
$iconScript = Join-Path $projectDir "launcher\New-LauncherIcon.ps1"
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "找不到 Windows .NET Framework 编译器 csc.exe"
}
if (-not (Test-Path -LiteralPath $source)) {
  throw "找不到启动器源码 launcher\DeepSeekLauncher.cs"
}

& $iconScript

& $compiler `
  /nologo `
  /target:winexe `
  /platform:x64 `
  /optimize+ `
  /out:"$output" `
  /win32icon:"$icon" `
  /r:System.dll `
  /r:System.Core.dll `
  /r:System.Drawing.dll `
  /r:System.Windows.Forms.dll `
  "$source"

if ($LASTEXITCODE -ne 0) {
  throw "桌面启动器编译失败"
}

Write-Host "Built: $output"
