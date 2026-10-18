param(
  [switch]$Launch
)

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $projectDir "DeepSeekLauncher.exe"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "请先运行 npm run build:launcher 生成 DeepSeekLauncher.exe"
}

$desktop = [Environment]::GetFolderPath("Desktop")
if (-not $desktop -or -not (Test-Path -LiteralPath $desktop)) {
  throw "找不到当前用户的桌面目录"
}

$shortcutPath = Join-Path $desktop "DeepSeek 用量监控.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$launcher,0"
$shortcut.Description = "启动 DeepSeek 用量监控悬浮窗"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "Shortcut: $shortcutPath"

if ($Launch) {
  Start-Process -FilePath $launcher -WorkingDirectory $projectDir
}
