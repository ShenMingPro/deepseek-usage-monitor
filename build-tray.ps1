$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $projectDir "tray\DeepSeekUsageTray.cs"
$output = Join-Path $projectDir "DeepSeekUsageTray.exe"
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "找不到 Windows .NET Framework 编译器 csc.exe"
}

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
  "$source"

if ($LASTEXITCODE -ne 0) {
  throw "托盘程序编译失败"
}

Write-Host "Built: $output"
