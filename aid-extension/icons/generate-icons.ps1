Add-Type -AssemblyName System.Drawing

$basePath = 'k:\___EMBRACETHERED_EXTENSION____\aid\aid-extension\icons'
$sizes = @(16, 32, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'HighQuality'
    $g.InterpolationMode = 'HighQualityBicubic'

    $scale = $size / 128.0

    # Rounded dark background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 26, 26, 62))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    # Magnifying glass lens circle
    $penWidth = [math]::Max(1, [int](6 * $scale))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 37, 99, 235), $penWidth)
    $cx = [int](56 * $scale)
    $cy = [int](56 * $scale)
    $r = [int](28 * $scale)
    $g.DrawEllipse($pen, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))

    # Handle
    $handleWidth = [math]::Max(1, [int](8 * $scale))
    $handlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 124, 58, 237), $handleWidth)
    $g.DrawLine($handlePen, [int](78 * $scale), [int](78 * $scale), [int](100 * $scale), [int](100 * $scale))

    # U+ text
    $fontSize = [math]::Max(5, [int](16 * $scale))
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 255, 136))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $g.DrawString('U+', $font, $textBrush, [float]$cx, [float]$cy, $sf)

    # Red severity dot
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 244, 67, 54))
    $dotR = [math]::Max(1, [int](2.5 * $scale))
    $g.FillEllipse($dotBrush, ([int](42 * $scale) - $dotR), ([int](46 * $scale) - $dotR), ($dotR * 2), ($dotR * 2))

    $g.Dispose()
    $outPath = Join-Path $basePath "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $outPath"
}
