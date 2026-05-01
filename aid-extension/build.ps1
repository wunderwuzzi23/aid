# AID Browser Extension Build Script (PowerShell)
# Creates store-ready archives for Chrome, Firefox, and Edge

param(
    [ValidateSet('all', 'chrome', 'firefox', 'edge')]
    [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $scriptDir 'dist'

# Files to include in the extension
$extensionFiles = @(
    'manifest.json',
    'background.js',
    'content.js',
    'unicode-chars.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'panel.html',
    'panel.js',
    'panel.css',
    'shared.css',
    'shared-ui.js',
    'styles.css',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png'
)

function Build-Chrome {
    Write-Host "`n[Chrome] Building..." -ForegroundColor Cyan
    $outDir = Join-Path $distDir 'chrome'
    if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
    New-Item $outDir -ItemType Directory -Force | Out-Null
    New-Item (Join-Path $outDir 'icons') -ItemType Directory -Force | Out-Null

    foreach ($file in $extensionFiles) {
        $src = Join-Path $scriptDir $file
        $dest = Join-Path $outDir $file
        if (Test-Path $src) {
            Copy-Item $src $dest
        }
    }

    # Copy themes directory
    $themesSrc = Join-Path $scriptDir 'themes'
    if (Test-Path $themesSrc) {
        $themesDest = Join-Path $outDir 'themes'
        Copy-Item $themesSrc $themesDest -Recurse -Force | Out-Null
    }

    # Create zip
    $zipPath = Join-Path $distDir 'ass-chrome.zip'
    if (Test-Path $zipPath) { Remove-Item $zipPath }
    Compress-Archive -Path "$outDir\*" -DestinationPath $zipPath
    Write-Host "[Chrome] Created: $zipPath" -ForegroundColor Green
}

function Build-Firefox {
    Write-Host "`n[Firefox] Building..." -ForegroundColor Cyan
    $outDir = Join-Path $distDir 'firefox'
    if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
    New-Item $outDir -ItemType Directory -Force | Out-Null
    New-Item (Join-Path $outDir 'icons') -ItemType Directory -Force | Out-Null

    foreach ($file in $extensionFiles) {
        $src = Join-Path $scriptDir $file
        $dest = Join-Path $outDir $file
        if (Test-Path $src) {
            Copy-Item $src $dest
        }
    }

    # Copy themes directory
    $themesSrc = Join-Path $scriptDir 'themes'
    if (Test-Path $themesSrc) {
        $themesDest = Join-Path $outDir 'themes'
        Copy-Item $themesSrc $themesDest -Recurse -Force | Out-Null
    }

    # Merge Firefox manifest overrides
    $baseManifest = Get-Content (Join-Path $scriptDir 'manifest.json') | ConvertFrom-Json
    $firefoxOverrides = Get-Content (Join-Path $scriptDir 'manifest.firefox.json') | ConvertFrom-Json

    # Add Firefox-specific keys
    $baseManifest | Add-Member -NotePropertyName 'browser_specific_settings' -NotePropertyValue $firefoxOverrides.browser_specific_settings -Force
    $baseManifest | Add-Member -NotePropertyName 'sidebar_action' -NotePropertyValue $firefoxOverrides.sidebar_action -Force

    # Remove Chrome-specific keys
    $baseManifest.PSObject.Properties.Remove('side_panel')

    # Remove sidePanel from permissions
    $perms = @($baseManifest.permissions | Where-Object { $_ -ne 'sidePanel' })
    $baseManifest.permissions = $perms

    # Write merged manifest
    $baseManifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $outDir 'manifest.json')

    # Create xpi (just a zip with .xpi extension)
    $xpiPath = Join-Path $distDir 'ass-firefox.xpi'
    if (Test-Path $xpiPath) { Remove-Item $xpiPath }
    Compress-Archive -Path "$outDir\*" -DestinationPath ($xpiPath -replace '\.xpi$', '.zip')
    Rename-Item ($xpiPath -replace '\.xpi$', '.zip') $xpiPath
    Write-Host "[Firefox] Created: $xpiPath" -ForegroundColor Green
}

function Build-Edge {
    Write-Host "`n[Edge] Building..." -ForegroundColor Cyan
    $outDir = Join-Path $distDir 'edge'
    if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
    New-Item $outDir -ItemType Directory -Force | Out-Null
    New-Item (Join-Path $outDir 'icons') -ItemType Directory -Force | Out-Null

    foreach ($file in $extensionFiles) {
        $src = Join-Path $scriptDir $file
        $dest = Join-Path $outDir $file
        if (Test-Path $src) {
            Copy-Item $src $dest
        }
    }

    # Copy themes directory
    $themesSrc = Join-Path $scriptDir 'themes'
    if (Test-Path $themesSrc) {
        $themesDest = Join-Path $outDir 'themes'
        Copy-Item $themesSrc $themesDest -Recurse -Force | Out-Null
    }

    # Create zip
    $zipPath = Join-Path $distDir 'ass-edge.zip'
    if (Test-Path $zipPath) { Remove-Item $zipPath }
    Compress-Archive -Path "$outDir\*" -DestinationPath $zipPath
    Write-Host "[Edge] Created: $zipPath" -ForegroundColor Green
}

# Main
Write-Host "ASS Browser Extension Builder" -ForegroundColor White
Write-Host "=============================" -ForegroundColor DarkGray

if (!(Test-Path $distDir)) { New-Item $distDir -ItemType Directory -Force | Out-Null }

switch ($Target) {
    'chrome' { Build-Chrome }
    'firefox' { Build-Firefox }
    'edge' { Build-Edge }
    'all' { Build-Chrome; Build-Firefox; Build-Edge }
}

Write-Host "`nDone!" -ForegroundColor Green
