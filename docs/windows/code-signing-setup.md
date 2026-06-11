# Windows Code Signing Setup Guide

> **Issue:** #1244
> **Branch:** `feat/windows-signing-scaffolding-1244`

This document describes how to obtain and configure a Windows code signing
certificate for the Finance desktop application (MSIX packages).

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│ Gradle build │────▶│  MSI / MSIX   │────▶│  SignTool.exe      │
│ packageMsi   │     │  (unsigned)   │     │  (sign with cert)  │
└─────────────┘     └──────────────┘     └───────────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Timestamped &   │
                                          │  signed package  │
                                          └─────────────────┘
```

## Certificate Options

### Option A: Microsoft Partner Center (Recommended for Store)

For Microsoft Store distribution, the Store signs the package automatically.
You only need a **publisher identity** that matches your Partner Center account.

1. Create a [Microsoft Partner Center](https://partner.microsoft.com/) developer account
2. Register your app and note the **Package Identity** and **Publisher**
3. Update `apps/windows/packaging/AppxManifest.xml`:
   - `${MSIX_PACKAGE_IDENTITY}` → your registered Package Identity Name
   - `${MSIX_PUBLISHER_IDENTITY}` → your Publisher (e.g., `CN=XXXXXXXX-XXXX-...`)
   - `${MSIX_PUBLISHER_DISPLAY_NAME}` → your Publisher Display Name

### Option B: Code Signing Certificate (For Sideloading)

For sideloaded distribution (outside the Store), you need a code signing certificate:

1. **Purchase** a code signing certificate from a trusted CA:
   - [DigiCert](https://www.digicert.com/signing/code-signing-certificates)
   - [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)
   - [GlobalSign](https://www.globalsign.com/en/code-signing-certificate)
2. **Export** the certificate as a `.pfx` file with a strong password
3. **Base64-encode** the certificate for GitHub Actions:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\cert.pfx"))
   ```
4. Store the output as `WINDOWS_SIGNING_CERT_BASE64` in GitHub Actions secrets
5. Store the certificate password as `WINDOWS_CERT_PASSWORD`

### Option C: Self-Signed Certificate (Development Only)

For local development and testing only:

```powershell
# Create a self-signed certificate (PowerShell as Admin)
New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=Finance Dev, O=Finance, L=Local, S=Dev, C=US" `
  -KeyUsage DigitalSignature `
  -FriendlyName "Finance Dev Signing" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3","2.5.29.19={text}")
```

> ⚠️ Self-signed certificates are NOT trusted by Windows SmartScreen
> and will trigger security warnings. Use only for development.

## GitHub Actions Secrets

The following secrets must be configured in the repository's GitHub Actions
settings for automated signing in CI/CD:

| Secret                        | Description                            | Required For     |
| ----------------------------- | -------------------------------------- | ---------------- |
| `WINDOWS_SIGNING_CERT_BASE64` | Base64-encoded `.pfx` certificate file | Store + Sideload |
| `WINDOWS_CERT_PASSWORD`       | Password for the `.pfx` certificate    | Store + Sideload |

### How to Configure

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Add `WINDOWS_SIGNING_CERT_BASE64` with the base64 string
4. Add `WINDOWS_CERT_PASSWORD` with the certificate password

## Existing CI/CD Integration

The signing step is already integrated in `.github/workflows/release-platform.yml`:

```yaml
- name: Sign MSIX package
  if: inputs.channel == 'store'
  shell: pwsh
  run: |
    $certBytes = [System.Convert]::FromBase64String("${{ secrets.WINDOWS_SIGNING_CERT_BASE64 }}")
    $certPath = Join-Path $env:RUNNER_TEMP "signing-cert.pfx"
    [System.IO.File]::WriteAllBytes($certPath, $certBytes)
    # ... sign with signtool ...
    Remove-Item $certPath -Force
```

## Local Signing with `sign-msix.ps1`

A local signing script is provided at `apps/windows/packaging/sign-msix.ps1`
for development/testing use. See that file for usage instructions.

## MSIX Packaging Structure

The existing packaging structure:

```
apps/windows/packaging/
├── AppxManifest.xml          # MSIX manifest with placeholder publisher identity
├── build-msix.ps1            # Build pipeline script (builds + optional signing)
├── sign-msix.ps1             # Local signing script (added in this branch)
├── icons/                    # App icons for MSIX tiles
├── resources/                # App resources
├── store/                    # Store submission assets
└── vcd/                      # Voice Command Definitions
```

## AppxManifest Placeholders

The following placeholders in `AppxManifest.xml` must be filled:

| Placeholder                      | Value Source                              |
| -------------------------------- | ----------------------------------------- |
| `${MSIX_PACKAGE_IDENTITY}`       | Partner Center → App Identity → Name      |
| `${MSIX_PUBLISHER_IDENTITY}`     | Partner Center → App Identity → Publisher |
| `${MSIX_PUBLISHER_DISPLAY_NAME}` | Your company/developer name               |
| `${MSIX_PACKAGE_VERSION}`        | Set by CI from git tag (e.g., `1.0.0.0`)  |
| `${WIDGET_PROVIDER_CLSID}`       | Generate with `[guid]::NewGuid()`         |

## Verification Checklist

- [ ] Partner Center developer account created
- [ ] App registered in Partner Center
- [ ] Publisher identity copied to AppxManifest.xml
- [ ] Code signing certificate obtained (CA-issued or Store-managed)
- [ ] Certificate exported as `.pfx` with password
- [ ] `WINDOWS_SIGNING_CERT_BASE64` set in GitHub Actions secrets
- [ ] `WINDOWS_CERT_PASSWORD` set in GitHub Actions secrets
- [ ] Local signing tested with `sign-msix.ps1`
- [ ] CI signing tested via `release-platform.yml` (dry run)
- [ ] WACK (Windows App Certification Kit) tests pass on signed package
