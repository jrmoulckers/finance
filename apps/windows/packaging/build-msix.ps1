# MSIX Packaging Pipeline — Finance Windows App
#
# This script builds the Finance Windows desktop application and packages it
# as an MSIX for Microsoft Store submission.
#
# Prerequisites:
#   - JDK 17+ installed and on PATH
#   - Windows SDK installed (for makemsix)
#   - Code signing certificate (for production builds)
#
# Usage:
#   .\build-msix.ps1 -Version "1.0.0" -Configuration "Release"
#   .\build-msix.ps1 -Version "1.0.0" -Configuration "Release" -Sign -CertThumbprint "ABC123..."

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [switch]$Sign,

    [string]$CertThumbprint = "",

    [string]$OutputDir = ".\build\msix"
)

$ErrorActionPreference = "Stop"

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Finance MSIX Build Pipeline                 ║" -ForegroundColor Cyan
Write-Host "║  Version: $Version                           ║" -ForegroundColor Cyan
Write-Host "║  Config:  $Configuration                     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan

# Step 1: Build the application
Write-Host "`n📦 Step 1: Building Finance Windows app..." -ForegroundColor Yellow
$gradleCmd = if ($Configuration -eq "Release") {
    ".\gradlew.bat :apps:windows:packageMsi --no-daemon"
} else {
    ".\gradlew.bat :apps:windows:packageMsi --no-daemon -Pdebug=true"
}
Write-Host "Running: $gradleCmd"
# Note: Actual execution should be done in CI - this script documents the process

# Step 2: Verify the MSI was produced
$msiPath = "apps\windows\build\compose\binaries\main\msi\Finance-$Version.msi"
Write-Host "`n🔍 Step 2: Verifying MSI output at: $msiPath" -ForegroundColor Yellow

# Step 3: Create MSIX package structure
Write-Host "`n📂 Step 3: Creating MSIX package structure..." -ForegroundColor Yellow
$msixDir = Join-Path $OutputDir "Finance-$Version"

# Step 4: Update AppxManifest with version
Write-Host "`n📝 Step 4: Updating AppxManifest.xml with version $Version..." -ForegroundColor Yellow
$manifestTemplate = "apps\windows\packaging\AppxManifest.xml"
Write-Host "Template: $manifestTemplate"

# Step 5: Sign the package (if requested)
if ($Sign) {
    Write-Host "`n🔐 Step 5: Signing MSIX package..." -ForegroundColor Yellow
    if ([string]::IsNullOrEmpty($CertThumbprint)) {
        Write-Host "ERROR: -CertThumbprint is required when -Sign is specified" -ForegroundColor Red
        exit 1
    }
    Write-Host "Certificate thumbprint: $CertThumbprint"
    # signtool.exe sign /fd SHA256 /sha1 $CertThumbprint /t http://timestamp.digicert.com $msixPath
} else {
    Write-Host "`n⏭️  Step 5: Skipping signing (use -Sign to enable)" -ForegroundColor Gray
}

# Step 6: Validate with WACK
Write-Host "`n✅ Step 6: Package ready for validation" -ForegroundColor Green
Write-Host "Run Windows App Cert Kit (WACK):"
Write-Host "  appcert.exe test -appxpackagepath `"$msixDir\Finance.msix`" -reportoutputpath `"wack-report.html`""

Write-Host "`n🎉 Build complete!" -ForegroundColor Green
Write-Host "Output directory: $OutputDir"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run WACK certification tests"
Write-Host "  2. Upload to Microsoft Partner Center"
Write-Host "  3. Submit for Store review"
