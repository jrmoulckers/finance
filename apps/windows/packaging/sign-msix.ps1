# MSIX Signing Script — Finance Windows App
#
# Signs a built MSI/MSIX package with a code signing certificate.
# Intended for local development and testing — CI uses the workflow in
# .github/workflows/release-windows.yml instead.
#
# Prerequisites:
#   - Windows SDK installed (provides signtool.exe)
#   - A code signing certificate installed in the certificate store
#     OR a .pfx file with password
#
# Usage:
#   # Sign using certificate thumbprint (from cert store)
#   .\sign-msix.ps1 -PackagePath ".\build\Finance-1.0.0.msi" -CertThumbprint "ABC123DEF..."
#
#   # Sign using .pfx file
#   .\sign-msix.ps1 -PackagePath ".\build\Finance-1.0.0.msi" -CertFile ".\certs\signing.pfx" -CertPassword "YOUR_PASSWORD"
#
# SECURITY: Never commit .pfx files or passwords to source control.
#           Use environment variables or a secrets manager for automation.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Path to the MSI/MSIX package to sign")]
    [ValidateScript({ Test-Path $_ })]
    [string]$PackagePath,

    [Parameter(Mandatory = $false, HelpMessage = "Certificate thumbprint (from cert store)")]
    [string]$CertThumbprint,

    [Parameter(Mandatory = $false, HelpMessage = "Path to .pfx certificate file")]
    [ValidateScript({ if ($_ -and -not (Test-Path $_)) { throw "Certificate file not found: $_" } $true })]
    [string]$CertFile,

    [Parameter(Mandatory = $false, HelpMessage = "Password for .pfx certificate")]
    [string]$CertPassword,

    [Parameter(Mandatory = $false, HelpMessage = "Timestamp server URL")]
    [string]$TimestampServer = "http://timestamp.digicert.com",

    [Parameter(Mandatory = $false, HelpMessage = "Hash algorithm for signing")]
    [ValidateSet("SHA256", "SHA384", "SHA512")]
    [string]$HashAlgorithm = "SHA256",

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── Validate parameters ──────────────────────────────────────────────────

if (-not $CertThumbprint -and -not $CertFile) {
    Write-Error "You must specify either -CertThumbprint or -CertFile."
    exit 1
}

if ($CertFile -and -not $CertPassword) {
    Write-Error "You must specify -CertPassword when using -CertFile."
    exit 1
}

# ── Locate signtool.exe ──────────────────────────────────────────────────

$signtoolPaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe"
    "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
)

$signtool = $null
foreach ($pattern in $signtoolPaths) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
        Sort-Object { [version]($_.Directory.Parent.Name) } -Descending |
        Select-Object -First 1
    if ($found) {
        $signtool = $found.FullName
        break
    }
}

if (-not $signtool) {
    Write-Error @"
signtool.exe not found. Install the Windows SDK:
  https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
"@
    exit 1
}

Write-Host "Using signtool: $signtool" -ForegroundColor Cyan

# ── Build the signtool arguments ─────────────────────────────────────────

$signArgs = @("sign", "/fd", $HashAlgorithm)

if ($CertThumbprint) {
    $signArgs += @("/sha1", $CertThumbprint)
    Write-Host "Signing with certificate thumbprint: $CertThumbprint" -ForegroundColor Yellow
} else {
    $signArgs += @("/f", $CertFile, "/p", "***")  # Password masked in output
    Write-Host "Signing with certificate file: $CertFile" -ForegroundColor Yellow
}

$signArgs += @("/tr", $TimestampServer, "/td", $HashAlgorithm)
$signArgs += $PackagePath

# ── Sign ─────────────────────────────────────────────────────────────────

if ($DryRun) {
    Write-Host "`n[DRY RUN] Would execute:" -ForegroundColor Magenta
    # Show args with password masked
    $displayArgs = $signArgs -replace [regex]::Escape($CertPassword), "***"
    Write-Host "  $signtool $($displayArgs -join ' ')" -ForegroundColor Gray
    exit 0
}

Write-Host "`nSigning package: $PackagePath" -ForegroundColor Green

# Build actual args (with real password)
$actualArgs = @("sign", "/fd", $HashAlgorithm)
if ($CertThumbprint) {
    $actualArgs += @("/sha1", $CertThumbprint)
} else {
    $actualArgs += @("/f", $CertFile, "/p", $CertPassword)
}
$actualArgs += @("/tr", $TimestampServer, "/td", $HashAlgorithm)
$actualArgs += $PackagePath

& $signtool @actualArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Signing failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "`n✅ Package signed successfully!" -ForegroundColor Green

# ── Verify signature ─────────────────────────────────────────────────────

Write-Host "`nVerifying signature..." -ForegroundColor Yellow
& $signtool verify /pa /v $PackagePath
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Signature verification returned non-zero. This may be expected for self-signed certificates."
} else {
    Write-Host "✅ Signature verified!" -ForegroundColor Green
}
