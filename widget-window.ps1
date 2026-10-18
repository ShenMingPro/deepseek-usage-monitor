param(
  [ValidateSet("collapsed", "expanded")]
  [string]$Mode = "expanded"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DeepSeekWidgetWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(
    IntPtr hWnd,
    IntPtr insertAfter,
    int x,
    int y,
    int width,
    int height,
    uint flags);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  public static IntPtr FindWidgetWindow() {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      StringBuilder title = new StringBuilder(256);
      GetWindowText(hWnd, title, title.Capacity);
      if (title.ToString() != "DeepSeek Usage Widget") return true;
      found = hWnd;
      return false;
    }, IntPtr.Zero);
    return found;
  }
}
"@

[DeepSeekWidgetWindow]::SetProcessDPIAware() | Out-Null
$window = [DeepSeekWidgetWindow]::FindWidgetWindow()
if ($window -eq [IntPtr]::Zero) {
  throw "DeepSeek Usage Widget window not found"
}

$rect = New-Object DeepSeekWidgetWindow+RECT
[DeepSeekWidgetWindow]::GetWindowRect($window, [ref]$rect) | Out-Null
$currentWidth = [Math]::Max(1, $rect.Right - $rect.Left)
$currentHeight = [Math]::Max(1, $rect.Bottom - $rect.Top)

$layoutDirectory = Join-Path $env:LOCALAPPDATA "DeepSeekUsageMonitor"
$layoutFile = Join-Path $layoutDirectory "widget-layout.json"
New-Item -ItemType Directory -Force -Path $layoutDirectory | Out-Null

if ($Mode -eq "collapsed") {
  if ($currentHeight -gt 180) {
    [pscustomobject]@{
      width = $currentWidth
      height = $currentHeight
    } | ConvertTo-Json | Set-Content -LiteralPath $layoutFile -Encoding UTF8
  }

  $targetWidth = if ($currentWidth -ge 560 -and $currentWidth -le 1200) {
    $currentWidth
  } else {
    740
  }
  $targetHeight = 118
} else {
  $saved = $null
  if (Test-Path -LiteralPath $layoutFile) {
    try {
      $saved = Get-Content -LiteralPath $layoutFile -Raw | ConvertFrom-Json
    } catch {
      $saved = $null
    }
  }

  $targetWidth = if ($saved -and [int]$saved.width -ge 560) {
    [int]$saved.width
  } else {
    [Math]::Max(740, $currentWidth)
  }
  $targetHeight = if ($saved -and [int]$saved.height -ge 480) {
    [int]$saved.height
  } else {
    650
  }
}

$targetWidth = [Math]::Max(560, [Math]::Min(1200, $targetWidth))
$targetHeight = [Math]::Max(118, [Math]::Min(1200, $targetHeight))

$anchorScreen = [System.Windows.Forms.Screen]::FromPoint(
  (New-Object System.Drawing.Point($rect.Left, $rect.Top))
)
$workArea = $anchorScreen.WorkingArea
$x = [Math]::Max($workArea.Left, [Math]::Min($rect.Left, $workArea.Right - $targetWidth))
$y = [Math]::Max($workArea.Top, [Math]::Min($rect.Top, $workArea.Bottom - $targetHeight))

$flags = 0x0004 -bor 0x0010
[DeepSeekWidgetWindow]::SetWindowPos(
  $window,
  [IntPtr]::Zero,
  $x,
  $y,
  $targetWidth,
  $targetHeight,
  $flags
) | Out-Null

[pscustomobject]@{
  ok = $true
  mode = $Mode
  width = $targetWidth
  height = $targetHeight
  x = $x
  y = $y
} | ConvertTo-Json -Compress
