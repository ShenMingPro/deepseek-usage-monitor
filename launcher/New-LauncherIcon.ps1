$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectDir "assets"
$artifactsDir = Join-Path $projectDir "artifacts"
$iconPath = Join-Path $assetsDir "deepseek-launcher.ico"
$previewPath = Join-Path $artifactsDir "launcher-icon-preview.png"

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

function New-RoundedPath {
  param(
    [single]$X,
    [single]$Y,
    [single]$Width,
    [single]$Height,
    [single]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  Write-Output -NoEnumerate $path
}

function New-SparklePath {
  param(
    [single]$CenterX,
    [single]$CenterY,
    [single]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = $Radius
  $path.StartFigure()
  $path.AddBezier(
    $CenterX, $CenterY - $r,
    $CenterX + 0.12 * $r, $CenterY - 0.42 * $r,
    $CenterX + 0.42 * $r, $CenterY - 0.12 * $r,
    $CenterX + $r, $CenterY)
  $path.AddBezier(
    $CenterX + $r, $CenterY,
    $CenterX + 0.42 * $r, $CenterY + 0.12 * $r,
    $CenterX + 0.12 * $r, $CenterY + 0.42 * $r,
    $CenterX, $CenterY + $r)
  $path.AddBezier(
    $CenterX, $CenterY + $r,
    $CenterX - 0.12 * $r, $CenterY + 0.42 * $r,
    $CenterX - 0.42 * $r, $CenterY + 0.12 * $r,
    $CenterX - $r, $CenterY)
  $path.AddBezier(
    $CenterX - $r, $CenterY,
    $CenterX - 0.42 * $r, $CenterY - 0.12 * $r,
    $CenterX - 0.12 * $r, $CenterY - 0.42 * $r,
    $CenterX, $CenterY - $r)
  $path.CloseFigure()
  Write-Output -NoEnumerate $path
}

function New-IconBitmap {
  param([int]$Size)

  $bitmap = New-Object System.Drawing.Bitmap(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 256.0
    $graphics.ScaleTransform($scale, $scale)

    $background = New-RoundedPath -X 8 -Y 8 -Width 240 -Height 240 -Radius 54
    $backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.PointF]::new(26, 14),
      [System.Drawing.PointF]::new(232, 248),
      [System.Drawing.Color]::FromArgb(255, 26, 34, 66),
      [System.Drawing.Color]::FromArgb(255, 6, 9, 20))
    $graphics.FillPath($backgroundBrush, $background)
    $graphics.SetClip($background)

    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(14, -18, 228, 228)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(145, 70, 124, 255)
    $glowBrush.SurroundColors = [System.Drawing.Color[]]@(
      [System.Drawing.Color]::FromArgb(0, 70, 124, 255))
    $graphics.FillPath($glowBrush, $glowPath)

    $orbitState = $graphics.Save()
    $graphics.TranslateTransform(128, 130)
    $graphics.RotateTransform(-18)
    $orbitPen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb(82, 82, 218, 255),
      2.0)
    $graphics.DrawEllipse($orbitPen, -78, -46, 156, 92)
    $graphics.Restore($orbitState)

    $meteorPen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb(175, 138, 236, 255),
      4.0)
    $meteorPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $meteorPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($meteorPen, 176, 82, 208, 55)

    $meteorGlowBrush = New-Object System.Drawing.SolidBrush(
      [System.Drawing.Color]::FromArgb(58, 119, 229, 255))
    $graphics.FillEllipse($meteorGlowBrush, 195, 42, 32, 32)
    $meteorDotBrush = New-Object System.Drawing.SolidBrush(
      [System.Drawing.Color]::FromArgb(255, 214, 251, 255))
    $graphics.FillEllipse($meteorDotBrush, 207, 54, 7, 7)

    $star = New-SparklePath -CenterX 128 -CenterY 126 -Radius 78
    $starGlowPen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb(65, 113, 186, 255),
      11.0)
    $starGlowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($starGlowPen, $star)

    $starBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.PointF]::new(128, 45),
      [System.Drawing.PointF]::new(128, 205),
      [System.Drawing.Color]::FromArgb(255, 247, 253, 255),
      [System.Drawing.Color]::FromArgb(255, 119, 168, 255))
    $graphics.FillPath($starBrush, $star)
    $starPen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb(135, 223, 247, 255),
      1.2)
    $graphics.DrawPath($starPen, $star)

    $smallStar = New-SparklePath -CenterX 196 -CenterY 68 -Radius 19
    $smallStarBrush = New-Object System.Drawing.SolidBrush(
      [System.Drawing.Color]::FromArgb(255, 165, 244, 255))
    $graphics.FillPath($smallStarBrush, $smallStar)

    $dotGlowBrush = New-Object System.Drawing.SolidBrush(
      [System.Drawing.Color]::FromArgb(48, 73, 236, 195))
    $graphics.FillEllipse($dotGlowBrush, 53, 165, 32, 32)
    $dotBrush = New-Object System.Drawing.SolidBrush(
      [System.Drawing.Color]::FromArgb(255, 96, 235, 198))
    $graphics.FillEllipse($dotBrush, 64, 176, 10, 10)

    $graphics.ResetClip()
    $borderPen = New-Object System.Drawing.Pen(
      [System.Drawing.Color]::FromArgb(76, 145, 190, 255),
      2.0)
    $graphics.DrawPath($borderPen, $background)

    $backgroundBrush.Dispose()
    $glowBrush.Dispose()
    $glowPath.Dispose()
    $orbitPen.Dispose()
    $meteorPen.Dispose()
    $meteorGlowBrush.Dispose()
    $meteorDotBrush.Dispose()
    $starGlowPen.Dispose()
    $starBrush.Dispose()
    $starPen.Dispose()
    $smallStarBrush.Dispose()
    $dotGlowBrush.Dispose()
    $dotBrush.Dispose()
    $borderPen.Dispose()
    $star.Dispose()
    $smallStar.Dispose()
    $background.Dispose()
  }
  finally {
    $graphics.Dispose()
  }

  Write-Output -NoEnumerate $bitmap
}

function ConvertTo-IconDib {
  param([System.Drawing.Bitmap]$Bitmap)

  $width = $Bitmap.Width
  $height = $Bitmap.Height
  $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  $locked = $Bitmap.LockBits(
    $rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  try {
    $stride = $locked.Stride
    $pixels = New-Object byte[] ($stride * $height)
    [System.Runtime.InteropServices.Marshal]::Copy(
      $locked.Scan0,
      $pixels,
      0,
      $pixels.Length)
  }
  finally {
    $Bitmap.UnlockBits($locked)
  }

  $maskStride = [int]([Math]::Ceiling($width / 32.0) * 4)
  $mask = New-Object byte[] ($maskStride * $height)

  for ($y = 0; $y -lt $height; $y += 1) {
    $maskRow = $height - 1 - $y
    for ($x = 0; $x -lt $width; $x += 1) {
      $alpha = $pixels[$y * $stride + $x * 4 + 3]
      if ($alpha -lt 8) {
        $maskIndex = $maskRow * $maskStride + [int][Math]::Floor($x / 8)
        $mask[$maskIndex] = $mask[$maskIndex] -bor (1 -shl (7 - ($x % 8)))
      }
    }
  }

  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([UInt32]40)
    $writer.Write([Int32]$width)
    $writer.Write([Int32]($height * 2))
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]0)
    $writer.Write([UInt32]($width * $height * 4))
    $writer.Write([Int32]0)
    $writer.Write([Int32]0)
    $writer.Write([UInt32]0)
    $writer.Write([UInt32]0)

    for ($y = $height - 1; $y -ge 0; $y -= 1) {
      $writer.Write($pixels, $y * $stride, $stride)
    }
    $writer.Write($mask)
    $writer.Flush()
    Write-Output -NoEnumerate $stream.ToArray()
  }
  finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$frames = @()

foreach ($size in $sizes) {
  $bitmap = New-IconBitmap -Size $size
  try {
    $frameBytes = ConvertTo-IconDib -Bitmap $bitmap
    $frames += [pscustomobject]@{
      Size = $size
      Bytes = $frameBytes
    }
    if ($size -eq 256) {
      $bitmap.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
  }
  finally {
    $bitmap.Dispose()
  }
}

$iconStream = New-Object System.IO.MemoryStream
$iconWriter = New-Object System.IO.BinaryWriter($iconStream)
try {
  $iconWriter.Write([UInt16]0)
  $iconWriter.Write([UInt16]1)
  $iconWriter.Write([UInt16]$frames.Count)

  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $dimension = if ($frame.Size -ge 256) { [byte]0 } else { [byte]$frame.Size }
    $iconWriter.Write($dimension)
    $iconWriter.Write($dimension)
    $iconWriter.Write([byte]0)
    $iconWriter.Write([byte]0)
    $iconWriter.Write([UInt16]1)
    $iconWriter.Write([UInt16]32)
    $iconWriter.Write([UInt32]$frame.Bytes.Length)
    $iconWriter.Write([UInt32]$offset)
    $offset += $frame.Bytes.Length
  }

  foreach ($frame in $frames) {
    $iconWriter.Write([byte[]]$frame.Bytes)
  }

  $iconWriter.Flush()
  [System.IO.File]::WriteAllBytes($iconPath, $iconStream.ToArray())
}
finally {
  $iconWriter.Dispose()
  $iconStream.Dispose()
}

Write-Host "Icon: $iconPath"
Write-Host "Preview: $previewPath"
