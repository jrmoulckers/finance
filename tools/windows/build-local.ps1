# Finance Windows — Local Build & Test Script
#
# One-command build + sign + install + run for the Windows Compose Desktop app.
# Intended for developer use only. CI uses .github/workflows/build-windows-main.yml
# and release-windows.yml which sign with the real WINDOWS_SIGNING_CERT_BASE64.
#
# Usage examples (run from the repo root or any worktree):
#   tools\windows\build-local.ps1                 # build + sign (no install)
#   tools\windows\build-local.ps1 -Install        # build + sign + install
#   tools\windows\build-local.ps1 -Install -Run   # build + sign + install + launch
#   tools\windows\build-local.ps1 -Uninstall      # uninstall only (data-protected)
#   tools\windows\build-local.ps1 -NoSign         # skip signing (SmartScreen warns)
#   tools\windows\build-local.ps1 -InstallOnly    # skip Gradle, just sign+install
#                                                 # the most recent MSI in build/
#
# Data protection: -Install and -Uninstall refuse to touch the existing install
# if user data is present at the legacy path (%LOCALAPPDATA%\Finance\{data,security})
# or the new path shipped in #1900 (%LOCALAPPDATA%\FinanceUserData\{data,security,settings}).
# Pass -BackupData to snapshot to a sibling timestamped folder before proceeding,
# or -NoBackup to acknowledge the data may be lost.

[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Run,
    [switch]$Uninstall,
    [switch]$NoSign,
    [switch]$InstallOnly,
    [switch]$ForceUninstall,
    [switch]$BackupData,
    [switch]$NoBackup,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$PSStyle.OutputRendering = 'Host'

# ── Paths ───────────────────────────────────────────────────────────
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot    = Resolve-Path (Join-Path $scriptDir '..\..')
$gradlew     = Join-Path $repoRoot 'gradlew.bat'
$msiOutDir   = Join-Path $repoRoot 'apps\windows\build\compose\binaries\main\msi'
$certDir     = Join-Path $scriptDir 'dev-cert'
$installRoot = Join-Path $env:LOCALAPPDATA 'Finance'
$dataDir     = Join-Path $installRoot 'data'
$keyDir      = Join-Path $installRoot 'security'

# ── User-data root (#1900: data now lives OUTSIDE the install root) ──
# The app migrates legacy data from $installRoot\{data,security} into
# $userDataRoot\{data,security,settings} on first launch. Both layouts must
# be considered "user data" by the data-protection guard until the legacy
# directories are confirmed empty.
$userDataRoot     = Join-Path $env:LOCALAPPDATA 'FinanceUserData'
$newDataDir       = Join-Path $userDataRoot 'data'
$newKeyDir        = Join-Path $userDataRoot 'security'
$newSettingsDir   = Join-Path $userDataRoot 'settings'

# Convenience: all directories the data-protection guard inspects,
# tagged with the layout root they belong to so backups can mirror it.
$userDataDirs = @(
    @{ Name = 'legacy data';      Path = $dataDir;        Layout = 'legacy' },
    @{ Name = 'legacy security';  Path = $keyDir;         Layout = 'legacy' },
    @{ Name = 'data';             Path = $newDataDir;     Layout = 'new' },
    @{ Name = 'security';         Path = $newKeyDir;      Layout = 'new' },
    @{ Name = 'settings';         Path = $newSettingsDir; Layout = 'new' }
)

function Write-Step([string]$msg)    { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg)   { Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg)    { Write-Host "    [X]  $msg" -ForegroundColor Red }

# ── Discover signtool from Windows SDK ──────────────────────────────
function Find-SignTool {
    $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
    if (-not (Test-Path $sdkRoot)) { return $null }
    $candidate = Get-ChildItem -Path $sdkRoot -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
        Sort-Object -Property { [version]$_.Name } -Descending |
        ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
    return $candidate
}

# ── Per-machine dev cert (in user store, optionally exported to PFX) ──
function Get-DevCert {
    $subject = "CN=Finance Dev ($env:COMPUTERNAME)"
    $existing = Get-ChildItem Cert:\CurrentUser\My |
        Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date) } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1
    if ($existing) {
        Write-Ok "Reusing dev cert thumbprint $($existing.Thumbprint)"
        return $existing
    }
    Write-Step "Generating per-machine dev code-signing cert ($subject)"
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $subject `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -NotAfter (Get-Date).AddYears(2)
    Write-Ok "Created cert thumbprint $($cert.Thumbprint)"
    return $cert
}

function Get-DevPfxPath {
    if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir | Out-Null }
    return (Join-Path $certDir "$env:COMPUTERNAME.pfx")
}

function Get-DevPfxPassword {
    # Per-machine password derived from machine name + a fixed dev string.
    # Never committed, never crosses machines, only used to round-trip the cert
    # into a file signtool can read.
    return (ConvertTo-SecureString "finance-dev-$env:COMPUTERNAME" -AsPlainText -Force)
}

function Export-DevPfx([System.Security.Cryptography.X509Certificates.X509Certificate2]$cert) {
    $pfxPath = Get-DevPfxPath
    $pw = Get-DevPfxPassword
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pw -Force | Out-Null
    Write-Ok "Exported PFX to $pfxPath"
    return $pfxPath
}

# ── MSI install bookkeeping ─────────────────────────────────────────
function Get-InstalledFinance {
    $uninstallRoots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($root in $uninstallRoots) {
        if (-not (Test-Path $root)) { continue }
        $hit = Get-ChildItem $root -ErrorAction SilentlyContinue |
            Get-ItemProperty -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq 'Finance' } |
            Select-Object -First 1 DisplayName, DisplayVersion, InstallLocation, PSChildName
        if ($hit) { return $hit }
    }
    return $null
}

function Test-UserDataPresent {
    foreach ($entry in $userDataDirs) {
        $p = $entry.Path
        if ((Test-Path $p) -and ((Get-ChildItem $p -File -ErrorAction SilentlyContinue).Count -gt 0)) {
            return $true
        }
    }
    return $false
}

function Backup-UserData {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $env:LOCALAPPDATA "Finance-backup-$stamp"
    New-Item -ItemType Directory -Path $backup | Out-Null

    # Mirror the on-disk layout under the backup root so a restore is a
    # straight Copy-Item back to %LOCALAPPDATA%. Legacy and new live in
    # different sub-roots to keep them distinguishable on restore.
    $legacyBackup = Join-Path $backup 'Finance'
    $newBackup    = Join-Path $backup 'FinanceUserData'

    foreach ($entry in $userDataDirs) {
        $p = $entry.Path
        if (-not (Test-Path $p)) { continue }
        $destRoot = if ($entry.Layout -eq 'legacy') { $legacyBackup } else { $newBackup }
        if (-not (Test-Path $destRoot)) { New-Item -ItemType Directory -Path $destRoot | Out-Null }
        $leaf = Split-Path $p -Leaf
        Copy-Item -Path $p -Destination (Join-Path $destRoot $leaf) -Recurse -Force
        Write-Ok "Backed up $($entry.Name)\  -> $destRoot\$leaf"
    }

    Write-Warn2 "Restore (legacy): Copy-Item $legacyBackup\* $installRoot   -Recurse -Force"
    Write-Warn2 "Restore (new):    Copy-Item $newBackup\*    $userDataRoot  -Recurse -Force"
    return $backup
}

function Assert-SafeToUninstall {
    if (-not (Test-UserDataPresent)) { return }
    if ($BackupData) {
        Write-Step "User data detected — backing up before uninstall"
        Backup-UserData | Out-Null
        return
    }
    if ($NoBackup) {
        Write-Warn2 "User data detected, -NoBackup specified — data may be lost"
        return
    }
    Write-Fail "Existing user data detected under $installRoot and/or $userDataRoot."
    Write-Fail "Refusing to uninstall to avoid data loss (see #1900)."
    Write-Fail "Re-run with -BackupData (recommended) or -NoBackup to proceed."
    exit 2
}

function Invoke-Uninstall {
    Assert-SafeToUninstall
    $finance = Get-InstalledFinance
    if (-not $finance) {
        Write-Warn2 'Finance is not installed.'
        return
    }
    $productCode = $finance.PSChildName
    Write-Step "Uninstalling Finance $($finance.DisplayVersion) ($productCode)"
    $msiArgs = @('/x', $productCode, '/quiet', '/norestart', '/L*v', (Join-Path $env:TEMP 'finance-uninstall.log'))
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $msiArgs -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) {
        Write-Fail "msiexec exit code $($p.ExitCode). Log: $env:TEMP\finance-uninstall.log"
        exit $p.ExitCode
    }
    Write-Ok 'Uninstall complete.'
}

function Invoke-Install([string]$msiPath) {
    Write-Step "Installing $msiPath"
    $msiArgs = @('/i', $msiPath, '/quiet', '/norestart', '/L*v', (Join-Path $env:TEMP 'finance-install.log'))
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $msiArgs -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -eq 1638) {
        Write-Warn2 'msiexec 1638: another version installed. Uninstalling first.'
        if (-not $ForceUninstall) {
            Write-Fail 'Pass -ForceUninstall to remove the existing install first.'
            Write-Fail '(Data protection: also pass -BackupData or -NoBackup.)'
            exit 1638
        }
        Invoke-Uninstall
        $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $msiArgs -Wait -PassThru -NoNewWindow
    }
    if ($p.ExitCode -ne 0) {
        Write-Fail "msiexec exit code $($p.ExitCode). Log: $env:TEMP\finance-install.log"
        exit $p.ExitCode
    }
    Write-Ok 'Install complete.'
}

# ── Main flow ───────────────────────────────────────────────────────
Push-Location $repoRoot
try {
    if ($Uninstall) {
        Invoke-Uninstall
        exit 0
    }

    if (-not $InstallOnly) {
        if ($Clean) {
            Write-Step 'Cleaning previous Windows build outputs'
            & $gradlew ':apps:windows:clean' '--no-daemon'
            if ($LASTEXITCODE -ne 0) { Write-Fail 'Clean failed.'; exit $LASTEXITCODE }
        }
        Write-Step 'Building MSI (this may take several minutes on a cold cache)'
        & $gradlew ':apps:windows:packageMsi' '--no-daemon'
        if ($LASTEXITCODE -ne 0) { Write-Fail 'Gradle build failed.'; exit $LASTEXITCODE }
    }

    $msi = Get-ChildItem $msiOutDir -Filter '*.msi' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $msi) {
        Write-Fail "No MSI produced at $msiOutDir"
        exit 1
    }
    Write-Ok "MSI: $($msi.FullName) ($([math]::Round($msi.Length / 1MB, 1)) MB)"

    if (-not $NoSign) {
        Write-Step 'Signing MSI with per-machine dev cert'
        $signtool = Find-SignTool
        if (-not $signtool) {
            Write-Fail 'signtool.exe not found. Install Windows 10/11 SDK (kits 10\bin\<ver>\x64\).'
            Write-Fail 'Or re-run with -NoSign to skip signing.'
            exit 1
        }
        Write-Ok "signtool: $signtool"
        $cert = Get-DevCert
        $pfx  = Export-DevPfx $cert
        $pw   = Get-DevPfxPassword
        $pwPlain = [System.Net.NetworkCredential]::new('', $pw).Password
        & $signtool sign /f $pfx /p $pwPlain /fd sha256 /td sha256 /tr http://timestamp.digicert.com $msi.FullName
        if ($LASTEXITCODE -ne 0) {
            Write-Fail 'signtool failed.'
            exit $LASTEXITCODE
        }
        Write-Ok 'MSI signed.'
        $sig = Get-AuthenticodeSignature $msi.FullName
        Write-Ok "Signature: $($sig.Status), Signer: $($sig.SignerCertificate.Subject)"
        Write-Warn2 'Dev cert is self-signed — SmartScreen will still warn on first run for non-trusted users.'
    } else {
        Write-Warn2 'Skipping sign (-NoSign).'
    }

    if ($Install) {
        Invoke-Install $msi.FullName
        if ($Run) {
            $exe = Join-Path $installRoot 'Finance.exe'
            if (Test-Path $exe) {
                Write-Step "Launching $exe"
                Start-Process -FilePath $exe
                Write-Ok 'Launched.'
            } else {
                Write-Fail "Installed but $exe not found."
            }
        }
    } else {
        Write-Host ""
        Write-Host "To install:   tools\windows\build-local.ps1 -InstallOnly -Install [-ForceUninstall -BackupData] [-Run]" -ForegroundColor Cyan
        Write-Host "Or manually:  msiexec /i `"$($msi.FullName)`"" -ForegroundColor Cyan
    }
}
finally {
    Pop-Location
}
